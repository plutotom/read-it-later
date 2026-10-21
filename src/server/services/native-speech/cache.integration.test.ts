import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";

const testURL = process.env.NATIVE_SPEECH_TEST_DATABASE_URL;
vi.mock("~/env", () => ({
  env: {
    DATABASE_URL:
      process.env.NATIVE_SPEECH_TEST_DATABASE_URL ??
      "postgresql://localhost:5419/speech_test",
    NODE_ENV: "test",
    NATIVE_SPEECH_BLOB_TOKEN: "test-private-store",
  },
}));
const blobs = vi.hoisted(() => new Map<string, Buffer>());
const block = vi.hoisted(() => ({
  promise: undefined as Promise<void> | undefined,
}));
vi.mock("@vercel/blob", () => ({
  put: async (path: string, data: Buffer) => {
    await block.promise;
    const url = `https://private.blob.vercel-storage.com/${path}`;
    blobs.set(url, data);
    return { url };
  },
  del: async (url: string) => {
    blobs.delete(url);
  },
  get: async (url: string) =>
    blobs.has(url)
      ? {
          statusCode: 200,
          stream: new Response(new Uint8Array(blobs.get(url)!)).body,
        }
      : null,
}));
import { artifacts, removeArtifact } from "./cache";
import { db } from "./database";
import { nativeSpeechCache as table } from "~/server/db/schema";

describe.skipIf(!testURL)("real Postgres native speech fencing", () => {
  beforeAll(async () => {
    if (
      !testURL ||
      !["localhost", "127.0.0.1"].includes(new URL(testURL).hostname)
    )
      throw new Error("Integration tests require an isolated local database");
    const migration = await readFile(
      "drizzle/0012_native_speech_cache.sql",
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint"))
      await db.execute(
        sql.raw(
          statement.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS"),
        ),
      );
    await db
      .delete(table)
      .where(sql`${table.id} in (${"a".repeat(64)}, ${"b".repeat(64)})`);
  });
  it("admits only one worker, renews ownership, and rejects stale publication after takeover", async () => {
    const id = "a".repeat(64),
      first = randomUUID(),
      second = randomUUID();
    const winners = await Promise.all([
      artifacts.acquire(id, first),
      artifacts.acquire(id, second),
    ]);
    expect(winners.filter(Boolean)).toHaveLength(1);
    const owner = winners[0] ? first : second,
      stale = winners[0] ? second : first;
    expect(await artifacts.renew(id, stale)).toBe(false);
    expect(await artifacts.renew(id, owner)).toBe(true);
    await db
      .update(table)
      .set({ leaseUntil: new Date(0) })
      .where(eq(table.id, id));
    const takeover = randomUUID();
    expect(await artifacts.acquire(id, takeover)).toBe(true);
    expect(await artifacts.save(id, owner, "old")).toBe(false);
    expect(await artifacts.save(id, takeover, "new")).toBe(true);
    expect(await artifacts.read(id)).toBe("new");
    expect(await artifacts.save(id, takeover, "new")).toBe(true);
    expect(await artifacts.read(id)).toBe("new");
  });
  it("deletion fences a worker already uploading; explicit later playback can recreate", async () => {
    const id = "b".repeat(64),
      fence = randomUUID();
    await artifacts.acquire(id, fence);
    let release!: () => void;
    block.promise = new Promise<void>((r) => {
      release = r;
    });
    const upload = artifacts.save(id, fence, "old");
    await removeArtifact(id);
    release();
    block.promise = undefined;
    expect(await upload).toBe(false);
    expect((await artifacts.status(id))?.state).toBe("deleted");
    const next = randomUUID();
    expect(await artifacts.acquire(id, next)).toBe(true);
    expect(await artifacts.save(id, next, "recreated")).toBe(true);
    expect(await artifacts.read(id)).toBe("recreated");
  });
});
