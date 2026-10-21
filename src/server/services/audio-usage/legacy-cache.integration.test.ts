import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "~/server/db/schema";

const url = process.env.LISTENING_TEST_DATABASE_URL;
const blobs = vi.hoisted(() => new Map<string, Buffer>());
const storage = vi.hoisted(() => ({ deleted: vi.fn(), synthesize: vi.fn() }));
vi.mock("~/env", () => ({
  env: { NODE_ENV: "test", BLOB_READ_WRITE_TOKEN: "synthetic" },
}));
vi.mock("~/server/db", async () => {
  const name = "legacy_clone_b_" + randomUUID().replaceAll("-", "");
  const connection = postgres(
    process.env.LISTENING_TEST_DATABASE_URL ??
      "postgresql://127.0.0.1:5419/unused",
    {
      connection: { search_path: name },
      onnotice: () => undefined,
    },
  );
  return {
    db: drizzle(connection, { schema }),
    testConnection: connection,
    testSchema: name,
  };
});
vi.mock("../google-tts-client", () => ({
  getGoogleTTSClient: () => ({
    synthesizeSpeech: storage.synthesize,
    close: async () => undefined,
  }),
}));
vi.mock("@vercel/blob", () => ({
  put: async (_path: string, bytes: Buffer) => {
    const url =
      "https://synthetic.blob.vercel-storage.com/" + randomUUID() + ".mp3";
    blobs.set(url, Buffer.from(bytes));
    return { url };
  },
  del: async (url: string) => {
    storage.deleted(url);
    blobs.delete(url);
  },
}));
import { db } from "~/server/db";
import { legacyAudio, deleteLegacyAudio } from "./legacy";

describe.skipIf(!url)(
  "legacy paid audio across independent cloned schemas",
  () => {
    const nameA = "legacy_clone_a_" + randomUUID().replaceAll("-", "");
    const userId = "synthetic-clone-owner";
    const voice = "en-US-Chirp3-HD-Charon";
    let connection: postgres.Sql,
      nameB: string,
      databaseA: ReturnType<typeof drizzle<typeof schema>>,
      connectionA: postgres.Sql;
    beforeAll(async () => {
      if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
        throw new Error("Isolated local DB required");
      const test = (await import("~/server/db")) as unknown as {
        testConnection: postgres.Sql;
        testSchema: string;
      };
      connection = test.testConnection;
      nameB = test.testSchema;
      await connection.unsafe(
        `create schema "${nameA}"; create schema "${nameB}"`,
      );
      await connection.unsafe(`create table "read-it-later_user" (id text primary key);
      create table "read-it-later_article" (id uuid primary key);
      create table "read-it-later_tts_usage" (id text primary key, "userId" text, "billingPeriod" text, "charactersUsed" integer, "rawCharactersUsed" integer, "createdAt" timestamp default now(), "updatedAt" timestamp default now(), unique("userId", "billingPeriod"));`);
      await connection.unsafe(
        readFileSync("drizzle/0007_low_ironclad.sql", "utf8").split(
          "--> statement-breakpoint",
        )[1]!,
      );
      await connection`alter table "read-it-later_article_audio" add column "userId" text not null`;
      for (const file of [
        "0013_web_listening_usage.sql",
        "0014_audio_usage.sql",
      ])
        for (const statement of readFileSync("drizzle/" + file, "utf8").split(
          "--> statement-breakpoint",
        ))
          await connection.unsafe(statement);
      await connection`insert into "read-it-later_user" values (${userId})`;
      await connection.unsafe(
        `create table "${nameA}"."read-it-later_article_audio" (like "${nameB}"."read-it-later_article_audio" including all)`,
      );
      connectionA = postgres(url, { connection: { search_path: nameA } });
      databaseA = drizzle(connectionA, { schema });
      storage.synthesize.mockResolvedValue([
        { audioContent: Buffer.from("new synthetic audio") },
      ]);
    });
    afterAll(async () => {
      if (connection) {
        await connectionA?.end();
        await connection.unsafe(
          `drop schema "${nameA}" cascade; drop schema "${nameB}" cascade`,
        );
        await connection.end();
      }
    });
    async function cloneRecording() {
      const articleId = randomUUID();
      const audioUrl =
        "https://synthetic.blob.vercel-storage.com/paid-" + articleId + ".mp3";
      blobs.set(audioUrl, Buffer.from("existing paid bytes"));
      await connection`insert into "read-it-later_article" values (${articleId})`;
      const row = { userId, articleId, audioUrl, voiceName: voice };
      await db.insert(schema.articleAudio).values(row);
      await databaseA.insert(schema.articleAudio).values(row);
      return { articleId, audioUrl };
    }
    async function expectOriginalPlayable(articleId: string, audioUrl: string) {
      const [saved] = await databaseA
        .select()
        .from(schema.articleAudio)
        .where(eq(schema.articleAudio.articleId, articleId));
      expect(saved?.audioUrl).toBe(audioUrl);
      expect(blobs.get(audioUrl)?.toString()).toBe("existing paid bytes");
      expect(storage.deleted).not.toHaveBeenCalled();
    }
    it("regenerates in B without deleting A's original URL or bytes", async () => {
      const { articleId, audioUrl } = await cloneRecording();
      const result = await legacyAudio({
        userId,
        articleId,
        voice,
        content: "<p>New synthetic paragraph.</p>",
        regenerate: true,
      });
      expect(result.audio.audioUrl).not.toBe(audioUrl);
      expect(blobs.get(result.audio.audioUrl)?.toString()).toBe(
        "new synthetic audio",
      );
      expect(storage.synthesize).toHaveBeenCalledTimes(1);
      expect(await db.select().from(schema.audioAttempts)).toHaveLength(1);
      await expectOriginalPlayable(articleId, audioUrl);
    });
    it("deletes B's reference without deleting A's original URL or bytes", async () => {
      const { articleId, audioUrl } = await cloneRecording();
      expect(await deleteLegacyAudio(userId, articleId)).toEqual({
        success: true,
        deleted: true,
      });
      expect(
        await db
          .select()
          .from(schema.articleAudio)
          .where(eq(schema.articleAudio.articleId, articleId)),
      ).toEqual([]);
      await expectOriginalPlayable(articleId, audioUrl);
    });
  },
);
