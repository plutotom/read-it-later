import { list, del } from "@vercel/blob";
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
let cursor,
  found = 0,
  removed = 0;
try {
  // Recover uploads that succeeded just before a worker/database failure. Never expire paid audio.
  for (let page = 0; page < 10; page++) {
    const result = await list({
      ...options,
      prefix: "native-speech/",
      limit: 100,
      cursor,
    });
    for (const blob of result.blobs) {
      if (Date.now() - blob.uploadedAt.getTime() < 86400_000) continue;
      const id = blob.pathname.split("/")[1];
      const rows =
        await database`select state, "blobUrl" from "read-it-later_native_speech_cache" where id = ${id}`;
      if (rows[0]?.state === "stored" && rows[0]?.blobUrl === blob.url)
        continue;
      found++;
      if (apply) {
        await database`insert into "read-it-later_native_speech_orphan" (url) values (${blob.url}) on conflict do nothing`;
        try {
          await del(blob.url, options);
          await database`delete from "read-it-later_native_speech_orphan" where url = ${blob.url}`;
          removed++;
        } catch {
          /* retry next run */
        }
      }
    }
    cursor = result.cursor;
    if (!result.hasMore) break;
  }
  console.log(
    JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      orphans: found,
      removed,
      more: !!cursor,
    }),
  );
} finally {
  await database.end();
}
