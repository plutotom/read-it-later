import { del } from "@vercel/blob";
import postgres from "postgres";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
loadProjectEnv();
if (
  !process.env.NATIVE_SPEECH_DATABASE_URL ||
  (!process.env.NATIVE_SPEECH_BLOB_STORE_ID &&
    !process.env.NATIVE_SPEECH_BLOB_TOKEN)
)
  throw new Error("Configure the speech database and private store first.");
const database = postgres(process.env.NATIVE_SPEECH_DATABASE_URL, { max: 1 });
const options = {
  token: process.env.NATIVE_SPEECH_BLOB_TOKEN,
  storeId: process.env.NATIVE_SPEECH_BLOB_STORE_ID,
};
const apply = process.argv.includes("--apply");
let removed = 0;
try {
  // Absence from this DB is NEVER proof of orphanhood: other environments may
  // share the store. Only fenced uploads/deletions explicitly queued by the app
  // are eligible. Unknown blobs and all paid stored audio remain untouched.
  const rows =
    await database`select url from "read-it-later_native_speech_orphan" where "createdAt" < now() - interval '24 hours' limit 1000`;
  for (const row of rows) {
    const url = new URL(row.url);
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".private.blob.vercel-storage.com") ||
      !/^\/native-speech\/[a-z0-9]{64}\/[a-f0-9-]{36}\.ndjson\.gz$/.test(
        url.pathname,
      )
    )
      continue;
    const references =
      await database`select id from "read-it-later_native_speech_cache" where "blobUrl" = ${row.url} and state = 'stored' limit 1`;
    if (references.length || !apply) continue;
    await del(row.url, options);
    await database`delete from "read-it-later_native_speech_orphan" where url = ${row.url}`;
    removed++;
  }
  console.log(
    JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      queued: rows.length,
      removed,
      unknownBlobs: "protected",
    }),
  );
} finally {
  await database.end();
}
