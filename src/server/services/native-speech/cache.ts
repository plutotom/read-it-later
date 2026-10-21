import { randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { get, put } from "@vercel/blob";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./database";
import { nativeSpeechCache as table } from "~/server/db/schema";
import { env } from "~/env";
import { type Event, SpeechFault } from "./protocol";

export interface ArtifactStore {
  acquire(id: string, fence: string): Promise<boolean>;
  renew(id: string, fence: string): Promise<boolean>;
  status(
    id: string,
  ): Promise<{ state: string; blobUrl: string | null } | undefined>;
  read(id: string): Promise<string | undefined>;
  save(id: string, fence: string, frames: string): Promise<boolean>;
  fail(id: string, fence: string): Promise<void>;
}
const owned = (id: string, fence: string) =>
  and(eq(table.id, id), eq(table.fence, fence), eq(table.state, "generating"));
export const artifacts: ArtifactStore = {
  async acquire(id, fence) {
    const result = await db
      .insert(table)
      .values({
        id,
        fence,
        state: "generating",
        leaseUntil: new Date(Date.now() + 150_000),
      })
      .onConflictDoUpdate({
        target: table.id,
        set: {
          fence,
          state: "generating",
          leaseUntil: new Date(Date.now() + 150_000),
          updatedAt: new Date(),
        },
        setWhere: sql`${table.state} in ('failed', 'deleted') or (${table.state} = 'generating' and ${table.leaseUntil} < now())`,
      })
      .returning({ id: table.id });
    return result.length === 1;
  },
  async renew(id, fence) {
    return (
      (
        await db
          .update(table)
          .set({
            leaseUntil: new Date(Date.now() + 150_000),
            updatedAt: new Date(),
          })
          .where(owned(id, fence))
          .returning({ id: table.id })
      ).length === 1
    );
  },
  async status(id) {
    return (
      await db
        .select({ state: table.state, blobUrl: table.blobUrl })
        .from(table)
        .where(eq(table.id, id))
        .limit(1)
    )[0];
  },
  async read(id) {
    const row = await this.status(id);
    if (row?.state !== "stored" || !row.blobUrl) return;
    const blob = await get(row.blobUrl, {
      access: "private",
      token: env.NATIVE_SPEECH_BLOB_TOKEN,
      storeId: env.NATIVE_SPEECH_BLOB_STORE_ID,
      useCache: false,
      abortSignal: AbortSignal.timeout(15_000),
    });
    if (blob?.statusCode !== 200)
      throw new SpeechFault(
        "cache_unavailable",
        "Saved speech is temporarily unavailable. Retry without generating a new copy.",
        503,
      );
    const data = await new Response(blob.stream).arrayBuffer();
    return gunzipSync(Buffer.from(data), {
      maxOutputLength: 32_000_000,
    }).toString("utf8");
  },
  async save(id, fence, frames) {
    const [before] = await db
      .select()
      .from(table)
      .where(eq(table.id, id))
      .limit(1);
    if (before?.state === "stored" && before.fence === fence) return true;
    if (before?.state !== "generating" || before.fence !== fence) return false;
    const blob = await put(
      `native-speech/${id}/${fence}.ndjson.gz`,
      gzipSync(frames),
      {
        access: "private",
        token: env.NATIVE_SPEECH_BLOB_TOKEN,
        storeId: env.NATIVE_SPEECH_BLOB_STORE_ID,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/gzip",
        abortSignal: AbortSignal.timeout(20_000),
      },
    );
    const result = await db
      .update(table)
      .set({ state: "stored", blobUrl: blob.url, updatedAt: new Date() })
      .where(owned(id, fence))
      .returning({ id: table.id });
    if (result.length === 0) {
      const [current] = await db
        .select()
        .from(table)
        .where(eq(table.id, id))
        .limit(1);
      if (
        current?.state === "stored" &&
        current.fence === fence &&
        current.blobUrl === blob.url
      )
        return true;
      // Retain the unreferenced upload for eventual store-wide reconciliation.
      await recordOrphan(blob.url);
    }
    return result.length === 1;
  },
  async fail(id, fence) {
    await db
      .update(table)
      .set({ state: "failed", updatedAt: new Date() })
      .where(owned(id, fence));
  },
};
export async function removeArtifact(id: string) {
  // Rotate fence before any network I/O. Even a worker already uploading cannot publish.
  const rows = await db
    .update(table)
    .set({ state: "deleted", fence: randomUUID(), updatedAt: new Date() })
    .where(eq(table.id, id))
    .returning({ blobUrl: table.blobUrl });
  for (const row of rows) if (row.blobUrl) await recordOrphan(row.blobUrl);
}
async function recordOrphan(url: string) {
  const { nativeSpeechOrphans } = await import("~/server/db/schema");
  await db.insert(nativeSpeechOrphans).values({ url }).onConflictDoNothing();
}
// Orphan rows are retained for store-wide reconciliation. A row in this database
// cannot prove exclusivity: a cloned/independent database can still reference the
// same paid artifact. Neither request handlers nor maintenance delete these blobs.
export function cachedFrames(raw: string): string {
  // A replay is the same audio, with explicit cache provenance and a fresh archive ack.
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const event = JSON.parse(line) as Event;
      return (
        JSON.stringify(
          event.type === "start" ? { ...event, cached: true } : event,
        ) + "\n"
      );
    })
    .join("");
}
