import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
loadProjectEnv();
if (!process.env.NATIVE_SPEECH_DATABASE_URL)
  throw new Error(
    "NATIVE_SPEECH_DATABASE_URL is required; this command never migrates the web database.",
  );
const database = postgres(
  process.env.NATIVE_SPEECH_DATABASE_URL_UNPOOLED ??
    process.env.NATIVE_SPEECH_DATABASE_URL,
  { max: 1 },
);
const folder = await mkdtemp(join(tmpdir(), "native-speech-migration-"));
try {
  await mkdir(join(folder, "meta"));
  const migration = await readFile(
    new URL("../drizzle/0012_native_speech_cache.sql", import.meta.url),
    "utf8",
  );
  await writeFile(join(folder, "0012_native_speech_cache.sql"), migration);
  await writeFile(
    join(folder, "meta/_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "postgresql",
      entries: [
        {
          idx: 0,
          version: "7",
          when: 1792209000000,
          tag: "0012_native_speech_cache",
          breakpoints: true,
        },
      ],
    }),
  );
  await database`select pg_advisory_lock(1580160012)`;
  await migrate(drizzle(database), {
    migrationsFolder: folder,
    migrationsSchema: "native_speech",
    migrationsTable: "__drizzle_migrations",
  });
  console.log(
    "Native speech migrations applied to the isolated speech database.",
  );
} finally {
  await database.end();
  await rm(folder, { recursive: true, force: true });
}
