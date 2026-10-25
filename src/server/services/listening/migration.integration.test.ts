import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  copyFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.LISTENING_TEST_DATABASE_URL;

describe.skipIf(!url)("web listening upgrade from an existing database", () => {
  const schema = "listening_upgrade_" + randomUUID().replaceAll("-", "");
  let connection: postgres.Sql | undefined;
  let migrationFolder: string | undefined;

  beforeAll(async () => {
    if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
      throw new Error("Migration tests require an isolated local database.");
    // Freeze this regression to the listening upgrade it actually models.
    // Future migrations get their own full-chain test rather than running on
    // an intentionally minimal 0012 fixture lacking unrelated application tables.
    migrationFolder = await mkdtemp(join(tmpdir(), "ril-listening-upgrade-"));
    await mkdir(join(migrationFolder, "meta"));
    const journal = JSON.parse(
      await readFile("drizzle/meta/_journal.json", "utf8"),
    ) as { entries: { tag: string }[] };
    journal.entries = journal.entries.slice(0, 15);
    await writeFile(
      join(migrationFolder, "meta/_journal.json"),
      JSON.stringify(journal),
    );
    for (const entry of journal.entries)
      await copyFile(
        join("drizzle", entry.tag + ".sql"),
        join(migrationFolder, entry.tag + ".sql"),
      );
    // Both application tables and migration history stay in this test's schema.
    connection = postgres(url, { max: 1, onnotice: () => undefined });
    await connection.unsafe(`CREATE SCHEMA "${schema}"`);
    await connection.unsafe(`SET search_path TO "${schema}"`);
    // Representative pre-upgrade records, including legacy playback state.
    // Earlier migrations are deliberately baselined: this tests the incremental
    // upgrade from 0012, not rebuilding the app's historical schema from scratch.
    await connection.unsafe(`
      CREATE TABLE "read-it-later_user" (id text PRIMARY KEY);
      CREATE TABLE "read-it-later_article" (
        id uuid PRIMARY KEY, "userId" text NOT NULL, content text NOT NULL
      );
      CREATE TABLE "read-it-later_article_audio" (
        "articleId" uuid PRIMARY KEY, "audioUrl" text NOT NULL,
        "voiceName" text NOT NULL, "currentTimeSeconds" real NOT NULL
      );
      CREATE TABLE "read-it-later_highlight" (
        "articleId" uuid NOT NULL, text text NOT NULL,
        "startOffset" integer NOT NULL, "endOffset" integer NOT NULL
      );
      CREATE TABLE "read-it-later_tts_usage" (
        "userId" text NOT NULL, "billingPeriod" text NOT NULL,
        "charactersUsed" integer NOT NULL, "rawCharactersUsed" integer NOT NULL
      );
      CREATE TABLE __drizzle_migrations (
        id serial PRIMARY KEY, hash text NOT NULL, created_at bigint
      );
    `);
    await connection`INSERT INTO "read-it-later_user" VALUES ('synthetic-upgrade-user')`;
    const article = "fe3618b0-a916-4539-9b5c-03ed654b40c4";
    await connection`INSERT INTO "read-it-later_article" VALUES (${article}, 'synthetic-upgrade-user', '<p>Synthetic migration fixture.</p>')`;
    await connection`INSERT INTO "read-it-later_article_audio" VALUES (${article}, 'https://example.invalid/saved.mp3', 'en-US-Chirp3-HD-Charon', 123.5)`;
    await connection`INSERT INTO "read-it-later_highlight" VALUES (${article}, 'Synthetic', 0, 9)`;
    for (const migration of readMigrationFiles({
      migrationsFolder: "drizzle",
    }).slice(0, 13)) {
      await connection`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (${migration.hash}, ${migration.folderMillis})`;
    }
  });

  afterAll(async () => {
    if (connection) {
      await connection.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await connection.end();
    }
    if (migrationFolder)
      await rm(migrationFolder, { recursive: true, force: true });
  });

  it("preserves legacy records, applies once, and leaves usage empty until streaming", async () => {
    if (!connection) throw new Error("Missing test connection");
    const sql = connection;
    const legacyState = async () => ({
      users: [...(await sql`SELECT * FROM "read-it-later_user"`)],
      articles: [...(await sql`SELECT * FROM "read-it-later_article"`)],
      audio: [...(await sql`SELECT * FROM "read-it-later_article_audio"`)],
      highlights: [...(await sql`SELECT * FROM "read-it-later_highlight"`)],
    });
    const before = await legacyState();
    if (!migrationFolder) throw new Error("Missing migration fixture folder");
    const options = {
      migrationsFolder: migrationFolder,
      migrationsSchema: schema,
    };
    await migrate(drizzle(sql), options);
    expect(await legacyState()).toEqual(before);
    expect(
      await sql`SELECT * FROM "read-it-later_listening_usage"`,
    ).toHaveLength(0);
    expect(await sql`SELECT * FROM __drizzle_migrations`).toHaveLength(15);

    // New usage accepts existing users without touching legacy audio/progress.
    await sql`INSERT INTO "read-it-later_listening_usage" ("userId", "window", characters, requests) VALUES ('synthetic-upgrade-user', 'month:2026-10', 42, 1)`;
    await migrate(drizzle(sql), options);
    expect(await sql`SELECT * FROM __drizzle_migrations`).toHaveLength(15);
    expect(
      await sql`SELECT characters, requests FROM "read-it-later_listening_usage"`,
    ).toEqual([{ characters: 42, requests: 1 }]);
    expect(await legacyState()).toEqual(before);
  });
});
