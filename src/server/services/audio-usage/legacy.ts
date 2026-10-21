import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "~/server/db";
import {
  articleAudio,
  ttsUsage,
  listeningUsage,
  audioJobs,
} from "~/server/db/schema";
import { TTS_FREE_TIER_LIMIT, toWeightedCharacters } from "~/lib/tts-voices";
import { generateAudioForArticle, prepareArticleAudio } from "../tts";
import { SpeechFault } from "../native-speech/protocol";
import {
  claimJob,
  finishJob,
  renewJob,
  recordReplay,
  settleJob,
} from "./ledger";
import { hash, month } from "./metering";

/** Existing whole-file API delegates here; no client-controlled owner or price. */
export async function recordLegacyReplay(userId: string, articleId: string) {
  await recordReplay(
    "legacy:" + hash(JSON.stringify([userId, articleId])),
    randomUUID(),
    db,
    { id: userId, articleId },
  );
}
export async function legacyAudio(input: {
  userId: string;
  articleId: string;
  content: string;
  voice: string;
  regenerate: boolean;
}) {
  const { userId, articleId, voice } = input;
  const key = "legacy:" + hash(JSON.stringify([userId, articleId]));
  const [existing] = await db
    .select()
    .from(articleAudio)
    .where(
      and(
        eq(articleAudio.articleId, articleId),
        eq(articleAudio.userId, userId),
      ),
    );
  if (existing && !input.regenerate) {
    await recordLegacyReplay(userId, articleId);
    return { audio: existing, cached: true };
  }
  const chunks = prepareArticleAudio(input.content, voice);
  const raw = chunks.reduce((sum, c) => sum + c.length, 0);
  const admittedAt = new Date();
  const weighted = toWeightedCharacters(raw, voice),
    period = month(admittedAt);
  const fence = await claimJob(
    {
      id: key,
      userId,
      articleId,
      path: "legacy",
      allowanceUnits: weighted,
      rawUnits: raw,
      admittedAt,
      regenerate: input.regenerate,
    },
    async (tx) => {
      const minute = "legacy-minute:" + admittedAt.toISOString().slice(0, 16);
      const rate = await tx
        .insert(listeningUsage)
        .values({ userId, window: minute, characters: 0, requests: 1 })
        .onConflictDoUpdate({
          target: [listeningUsage.userId, listeningUsage.window],
          set: { requests: sql`${listeningUsage.requests}+1` },
          setWhere: sql`${listeningUsage.requests}<20`,
        })
        .returning();
      if (!rate.length)
        throw new SpeechFault(
          "usage_limit",
          "Too many recording requests. Try again in a minute.",
          429,
        );
      if (weighted > TTS_FREE_TIER_LIMIT)
        throw new SpeechFault(
          "usage_limit",
          "The recording allowance has been reached.",
          429,
        );
      const rows = await tx
        .insert(ttsUsage)
        .values({
          id: nanoid(),
          userId,
          billingPeriod: period,
          charactersUsed: weighted,
          rawCharactersUsed: raw,
        })
        .onConflictDoUpdate({
          target: [ttsUsage.userId, ttsUsage.billingPeriod],
          set: {
            charactersUsed: sql`${ttsUsage.charactersUsed}+${weighted}`,
            rawCharactersUsed: sql`${ttsUsage.rawCharactersUsed}+${raw}`,
          },
          setWhere: sql`${ttsUsage.charactersUsed}+${weighted} <= ${TTS_FREE_TIER_LIMIT}`,
        })
        .returning();
      if (!rows.length)
        throw new SpeechFault(
          "usage_limit",
          "The recording allowance has been reached.",
          429,
        );
    },
  );
  if (!fence)
    throw new SpeechFault(
      "pending",
      "This recording is already being prepared. Retry in a moment.",
      409,
    );
  let dispatched = 0;
  const renewal = setInterval(() => {
    void renewJob(key, fence).catch(() => false);
  }, 30_000);
  try {
    // A request admitted after our first read may have completed before claim. Keep it.
    const [raced] = await db
      .select()
      .from(articleAudio)
      .where(
        and(
          eq(articleAudio.articleId, articleId),
          eq(articleAudio.userId, userId),
        ),
      );
    if (raced && !input.regenerate) {
      await finishJob(key, fence, "not_dispatched", "stored");
      return { audio: raced, cached: true };
    }
    const result = await generateAudioForArticle(
      articleId,
      input.content,
      voice,
      {
        userId,
        jobId: key,
        fence,
        onDispatched: (units) => {
          dispatched += units;
        },
      },
    );
    const audio = await db.transaction(async (tx) => {
      const owned = await tx
        .update(audioJobs)
        .set({ leaseUntil: new Date(Date.now() + 180_000) })
        .where(
          and(
            eq(audioJobs.id, key),
            eq(audioJobs.fence, fence),
            eq(audioJobs.state, "generating"),
          ),
        )
        .returning();
      if (!owned.length)
        throw new Error("Recording generation lease lost before publication");
      const [audio] = await tx
        .insert(articleAudio)
        .values({
          userId,
          articleId,
          audioUrl: result.audioUrl,
          voiceName: result.voiceName,
          durationSeconds: result.durationSeconds,
          fileSizeBytes: result.fileSizeBytes,
          generatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: articleAudio.articleId,
          set: {
            audioUrl: result.audioUrl,
            voiceName: result.voiceName,
            durationSeconds: result.durationSeconds,
            fileSizeBytes: result.fileSizeBytes,
            generatedAt: new Date(),
            currentTimeSeconds: 0,
          },
        })
        .returning();
      await settleJob(tx, key, fence, "complete", "stored");
      return audio!;
    });
    // The previous URL may still be referenced by a cloned database. Retain the
    // paid bytes until store-wide reference authority can prove exclusivity.
    return { audio, cached: false };
  } catch (error) {
    await finishJob(
      key,
      fence,
      dispatched ? "unknown" : "not_dispatched",
      "failed",
    ).catch(() => undefined);
    throw error;
  } finally {
    clearInterval(renewal);
  }
}

export async function deleteLegacyAudio(userId: string, articleId: string) {
  const key = "legacy:" + hash(JSON.stringify([userId, articleId]));
  const removed = await db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(audioJobs)
      .where(and(eq(audioJobs.id, key), eq(audioJobs.userId, userId)))
      .for("update");
    if (job) await settleJob(tx, key, job.fence, "unknown", "failed");
    return tx
      .delete(articleAudio)
      .where(
        and(
          eq(articleAudio.articleId, articleId),
          eq(articleAudio.userId, userId),
        ),
      )
      .returning({ url: articleAudio.audioUrl });
  });
  // Removing the account's reference does not prove the shared blob is unused.
  // Keep its bytes for other databases, just as for private speech artifacts.
  return { success: true, deleted: removed.length > 0 };
}
