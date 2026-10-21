import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { listeningUsage } from "~/server/db/schema";
import { env } from "~/env";
import { SpeechFault } from "../native-speech/protocol";

/**
 * Reserve before starting a billable request. Failed/canceled generations keep
 * their reservation because providers can charge for partially generated audio.
 * Database upserts enforce the limits across tabs and serverless instances.
 */
export async function reserveListeningUsage(
  userId: string,
  characters: number,
  now = new Date(),
) {
  await db.transaction(async (tx) => {
    const windows = [
      {
        window: "month:" + now.toISOString().slice(0, 7),
        limit: env.WEB_SPEECH_MONTHLY_CHARACTER_LIMIT ?? 500_000,
        requests: 1_000_000,
      },
      {
        window: "minute:" + now.toISOString().slice(0, 16),
        limit: 50_000,
        requests: 40,
      },
    ];
    for (const window of windows) {
      if (characters > window.limit)
        throw new SpeechFault(
          "usage_limit",
          "The listening limit has been reached. Try again later.",
          429,
        );
      const result = await tx
        .insert(listeningUsage)
        .values({ userId, window: window.window, characters, requests: 1 })
        .onConflictDoUpdate({
          target: [listeningUsage.userId, listeningUsage.window],
          set: {
            characters: sql`${listeningUsage.characters} + ${characters}`,
            requests: sql`${listeningUsage.requests} + 1`,
          },
          setWhere: sql`${listeningUsage.characters} + ${characters} <= ${window.limit} and ${listeningUsage.requests} < ${window.requests}`,
        })
        .returning({ userId: listeningUsage.userId });
      if (!result.length)
        throw new SpeechFault(
          "usage_limit",
          "The listening limit has been reached. Try again later.",
          429,
        );
    }
  });
}
