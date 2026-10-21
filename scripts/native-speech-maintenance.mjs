import postgres from "postgres";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
loadProjectEnv();
if (!process.env.NATIVE_SPEECH_DATABASE_URL)
  throw new Error("Configure the speech database first.");
// Even an explicit orphan queue entry is local to one database. A clone may
// retain the same blob URL. Do not delete until store-wide reference authority
// exists; --apply must never turn this incomplete evidence into deletion.
if (process.argv.includes("--apply"))
  throw new Error(
    "Blob deletion is disabled: exclusive ownership cannot be proven across speech databases. Run without --apply to inspect the retained queue.",
  );
const database = postgres(process.env.NATIVE_SPEECH_DATABASE_URL, { max: 1 });
try {
  const [row] =
    await database`select count(*)::text as queued from "read-it-later_native_speech_orphan"`;
  console.log(
    JSON.stringify({
      mode: "dry-run",
      queued: row?.queued ?? "0",
      removed: 0,
      deletion: "disabled_without_store_wide_reference_authority",
      unknownBlobs: "protected",
    }),
  );
} finally {
  await database.end();
}
