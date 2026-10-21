import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import {
  audioJobs,
  audioAttempts,
  audioEvents,
  audioCacheDeliveries,
  audioReservations,
  listeningUsage,
  ttsUsage,
} from "~/server/db/schema";
import { env } from "~/env";
import { SpeechFault } from "../native-speech/protocol";
import { estimatedUsd, rateFor, month, type PreparedSpeech } from "./metering";

export const environment = () =>
  process.env.VERCEL_ENV ??
  (env.NODE_ENV === "production" ? "production" : "development");
export type LedgerDb = typeof db;
export async function claimJob(
  input: {
    id: string;
    userId: string;
    articleId: string;
    path: "stream" | "legacy";
    regenerate?: boolean;
    allowanceUnits?: number;
    rawUnits?: number;
    admittedAt?: Date;
  },
  reserve: (
    tx: Parameters<Parameters<LedgerDb["transaction"]>[0]>[0],
  ) => Promise<void>,
  database = db,
) {
  const fence = randomUUID();
  const admittedAt = input.admittedAt ?? new Date();
  await recoverExpiredJobs(database, input.id);
  return database.transaction(async (tx) => {
    const rows = await tx
      .insert(audioJobs)
      .values({
        ...input,
        allowancePeriod: month(admittedAt),
        environment: environment(),
        state: "generating",
        fence,
        leaseUntil: new Date(Date.now() + 180_000),
      })
      .onConflictDoUpdate({
        target: audioJobs.id,
        set: {
          state: "generating",
          allowanceUnits: input.allowanceUnits ?? 0,
          allowancePeriod: month(admittedAt),
          fence,
          cacheState: "pending",
          leaseUntil: new Date(Date.now() + 180_000),
          updatedAt: new Date(),
        },
        setWhere: sql`${audioJobs.userId} = ${input.userId} and (${audioJobs.state} = 'not_dispatched' or (${input.regenerate === true} and (${audioJobs.state} <> 'generating' or ${audioJobs.leaseUntil} < now())))`,
      })
      .returning();
    if (!rows.length) {
      const [job] = await tx
        .select()
        .from(audioJobs)
        .where(eq(audioJobs.id, input.id));
      if (job?.state === "generating" && job.leaseUntil > new Date())
        return null;
      throw new SpeechFault(
        "regeneration_required",
        "This passage may already have incurred a generation charge. Review Audio usage in Preferences and explicitly regenerate to create another copy.",
        409,
      );
    }
    await reserve(tx);
    await tx.insert(audioReservations).values({
      id: fence,
      jobId: input.id,
      userId: input.userId,
      path: input.path,
      period: month(admittedAt),
      admittedAt,
      reservedUnits: input.allowanceUnits ?? 0,
      rawUnits: input.rawUnits ?? input.allowanceUnits ?? 0,
    });
    await tx
      .insert(audioEvents)
      .values({ id: fence + ":admitted", jobId: input.id, kind: "admitted" });
    return fence;
  });
}
export async function renewJob(id: string, fence: string, database = db) {
  return (
    (
      await database
        .update(audioJobs)
        .set({
          leaseUntil: new Date(Date.now() + 180_000),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(audioJobs.id, id),
            eq(audioJobs.fence, fence),
            eq(audioJobs.state, "generating"),
          ),
        )
        .returning()
    ).length === 1
  );
}
export async function finishJob(
  id: string,
  fence: string,
  state: "complete" | "unknown" | "not_dispatched",
  cacheState: "stored" | "failed" | "pending",
  database = db,
  onlyExpired = false,
) {
  await database.transaction((tx) =>
    settleJob(tx, id, fence, state, cacheState, onlyExpired),
  );
}
export async function settleJob(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  id: string,
  fence: string,
  state: "complete" | "unknown" | "not_dispatched",
  cacheState: "stored" | "failed" | "pending",
  onlyExpired = false,
) {
  const rows = await tx
    .update(audioJobs)
    .set({ state, cacheState, updatedAt: new Date() })
    .where(
      and(
        eq(audioJobs.id, id),
        eq(audioJobs.fence, fence),
        onlyExpired ? eq(audioJobs.state, "generating") : undefined,
        onlyExpired ? sql`${audioJobs.leaseUntil} < now()` : undefined,
      ),
    )
    .returning();
  if (rows.length) {
    const [reservation] = await tx
      .update(audioReservations)
      .set({ settled: true })
      .where(
        and(
          eq(audioReservations.id, fence),
          eq(audioReservations.settled, false),
        ),
      )
      .returning();
    if (reservation?.userId) {
      const unused = reservation.reservedUnits - reservation.dispatchedUnits;
      const rawUnused = reservation.rawUnits - reservation.rawDispatched;
      if (unused > 0 && reservation.path === "stream") {
        for (const window of [
          "month:" + reservation.period,
          "minute:" + reservation.admittedAt.toISOString().slice(0, 16),
        ])
          await tx
            .update(listeningUsage)
            .set({
              characters: sql`greatest(0,${listeningUsage.characters}-${unused})`,
              requests: sql`greatest(0,${listeningUsage.requests}-1)`,
            })
            .where(
              and(
                eq(listeningUsage.userId, reservation.userId),
                eq(listeningUsage.window, window),
              ),
            );
      } else if (unused > 0 && reservation.path === "legacy") {
        await tx
          .update(ttsUsage)
          .set({
            charactersUsed: sql`greatest(0,${ttsUsage.charactersUsed}-${unused})`,
            rawCharactersUsed: sql`greatest(0,${ttsUsage.rawCharactersUsed}-${rawUnused})`,
          })
          .where(
            and(
              eq(ttsUsage.userId, reservation.userId),
              eq(ttsUsage.billingPeriod, reservation.period),
            ),
          );
      }
      await tx
        .insert(audioEvents)
        .values({
          id: fence + ":quota_settled",
          jobId: id,
          kind: "quota_settled",
          units: reservation.dispatchedUnits,
        })
        .onConflictDoNothing();
    }
    await tx
      .insert(audioEvents)
      .values({
        id: fence + ":" + state + ":" + cacheState,
        jobId: id,
        kind: state + ":" + cacheState,
      })
      .onConflictDoNothing();
  }
}

export async function beginAttempt(
  jobId: string,
  userId: string,
  fence: string,
  prepared: PreparedSpeech,
  database = db,
  quota?: { units: number; raw: number },
) {
  const id = randomUUID();
  const providerAccount = env.AUDIO_USAGE_PROVIDER_ACCOUNT ?? "default";
  const rate = rateFor(
    prepared.provider,
    prepared.model,
    prepared.unit,
    providerAccount,
    env.AUDIO_USAGE_RATE_CARDS,
  );
  // Dispatch is permitted only after a durable, fenced attempt commit. A crash in the
  // following gap is deliberately uncertain, never assumed free or retried invisibly.
  await database.transaction(async (tx) => {
    const rows = await tx
      .update(audioJobs)
      .set({
        updatedAt: new Date(),
        leaseUntil: new Date(Date.now() + 180_000),
      })
      .where(
        and(
          eq(audioJobs.id, jobId),
          eq(audioJobs.userId, userId),
          eq(audioJobs.fence, fence),
          eq(audioJobs.state, "generating"),
        ),
      )
      .returning();
    if (!rows.length) throw new Error("Audio generation lease lost");
    if (quota) {
      const marked = await tx
        .update(audioReservations)
        .set({
          dispatchedUnits: sql`${audioReservations.dispatchedUnits}+${quota.units}`,
          rawDispatched: sql`${audioReservations.rawDispatched}+${quota.raw}`,
        })
        .where(
          and(
            eq(audioReservations.id, fence),
            eq(audioReservations.settled, false),
            sql`${audioReservations.dispatchedUnits}+${quota.units}<=${audioReservations.reservedUnits}`,
            sql`${audioReservations.rawDispatched}+${quota.raw}<=${audioReservations.rawUnits}`,
          ),
        )
        .returning();
      if (!marked.length)
        throw new Error("Audio quota reservation is unavailable");
    }

    await tx.insert(audioAttempts).values({
      id,
      jobId,
      userId,
      environment: environment(),
      providerAccount,
      provider: prepared.provider,
      model: prepared.model,
      voice: prepared.voice,
      payloadHash: prepared.payloadHash,
      unit: prepared.unit,
      requestedUnits: prepared.requestedUnits,
      measurement: prepared.measurement,
      rateVersion: rate?.version,
      usdPerMillion: rate?.usdPerMillion,
      estimatedUsd: estimatedUsd(prepared.requestedUnits, rate?.usdPerMillion),
    });
    await tx.insert(audioEvents).values({
      id: id + ":dispatch",
      jobId,
      attemptId: id,
      kind: "dispatch",
      units: prepared.requestedUnits,
    });
  });
  return id;
}
export async function checkpointUsage(
  id: string,
  units: number,
  database = db,
) {
  if (!Number.isSafeInteger(units) || units < 0)
    throw new Error("Invalid provider usage");
  await database.transaction(async (tx) => {
    const [attempt] = await tx
      .select()
      .from(audioAttempts)
      .where(eq(audioAttempts.id, id))
      .for("update");
    if (!attempt || attempt.finishedAt) return;
    await tx
      .update(audioAttempts)
      .set({
        reportedUnits: units,
        measurement: "provider_reported",
        estimatedUsd: estimatedUsd(units, attempt.usdPerMillion),
      })
      .where(eq(audioAttempts.id, id));
    await tx
      .insert(audioEvents)
      .values({
        id: id + ":usage:" + units,
        jobId: attempt.jobId,
        attemptId: id,
        kind: "provider_usage",
        units,
      })
      .onConflictDoNothing();
  });
}
export async function finishAttempt(
  id: string,
  complete: boolean,
  audioBytes: number,
  durationSeconds?: number,
  database = db,
) {
  await database.transaction(async (tx) => {
    const [attempt] = await tx
      .update(audioAttempts)
      .set({
        state: complete ? "complete" : "unknown",
        audioBytes,
        durationSeconds,
        finishedAt: new Date(),
      })
      .where(
        and(eq(audioAttempts.id, id), sql`${audioAttempts.finishedAt} is null`),
      )
      .returning();
    if (attempt)
      await tx
        .insert(audioEvents)
        .values({
          id: id + ":settled",
          jobId: attempt.jobId,
          attemptId: id,
          kind: complete ? "complete" : "unknown",
          units: attempt.reportedUnits ?? attempt.requestedUnits,
        })
        .onConflictDoNothing();
  });
}
export async function recordReplay(
  jobId: string,
  requestId: string,
  database = db,
  owner?: { id: string; articleId: string },
) {
  if (owner)
    await database
      .insert(audioCacheDeliveries)
      .values({
        id: requestId,
        userId: owner.id,
        articleId: owner.articleId,
        artifactId: jobId,
        environment: environment(),
      })
      .onConflictDoNothing()
      .catch(() => undefined);
  // Legacy cache entries need no ledger row and no backfilled invented price.
  await database
    .insert(audioEvents)
    .values({ id: requestId + ":replay", jobId, kind: "cached_delivery" })
    .onConflictDoNothing()
    .catch(() => undefined);
}

/** Fence expired workers before releasing only the chunks that were never dispatched. */
export async function recoverExpiredJobs(database = db, id?: string) {
  const rows = await database
    .select({ id: audioJobs.id, fence: audioJobs.fence })
    .from(audioJobs)
    .where(
      and(
        eq(audioJobs.state, "generating"),
        sql`${audioJobs.leaseUntil} < now()`,
        id ? eq(audioJobs.id, id) : undefined,
      ),
    )
    .limit(50);
  for (const row of rows)
    await finishJob(row.id, row.fence, "unknown", "failed", database, true);
  return rows.length;
}
