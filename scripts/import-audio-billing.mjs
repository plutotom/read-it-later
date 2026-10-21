import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import postgres from "postgres";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { prepareBillingImport } from "./lib/audio-billing.mjs";
loadProjectEnv();
const filename = process.argv.find(
  (arg, index) => index > 1 && !arg.startsWith("--"),
);
if (!filename || statSync(filename).size > 10_000_000)
  throw new Error("Supply a billing JSON export smaller than 10 MB");
const input = prepareBillingImport(JSON.parse(readFileSync(filename, "utf8")));
const apply = process.argv.includes("--apply");
if (!apply)
  console.log(
    JSON.stringify({
      mode: "dry-run",
      slices: input.rows.length,
      source: input.source,
    }),
  );
else {
  if (!process.env.DATABASE_URL)
    throw new Error("Set DATABASE_URL explicitly for the accounting database");
  const database = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    await database.begin(async (tx) => {
      const snapshot = JSON.stringify(input);
      const importId = createHash("sha256").update(snapshot).digest("hex");
      await tx`insert into "read-it-later_audio_billing_import" (id,source,snapshot) values (${importId},${input.source},${tx.json(input.rows)}) on conflict do nothing`;

      for (const row of input.rows)
        await tx`insert into "read-it-later_audio_billing" ${tx(row)} on conflict (id) do update set gross=excluded.gross,credits=excluded.credits,net=excluded.net,"importedAt"=now()`;
    });
    console.log(JSON.stringify({ mode: "apply", slices: input.rows.length }));
  } finally {
    await database.end();
  }
}
