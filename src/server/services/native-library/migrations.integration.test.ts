import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { afterAll, beforeAll, expect, it } from "vitest";

const url = process.env.NATIVE_LIBRARY_TEST_DATABASE_URL;
let admin: postgres.Sql | undefined;
let connection: postgres.Sql | undefined;
const database = "native_migration_" + randomUUID().replaceAll("-", "");

beforeAll(async () => {
  if (!url) return;
  const parsed = new URL(url);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname))
    throw new Error("Migration tests require isolated local Postgres.");
  admin = postgres(url, { max: 1, onnotice: () => undefined });
  // A separate disposable database exercises explicit public-qualified SQL too.
  await admin.unsafe(`CREATE DATABASE "${database}"`);
  parsed.pathname = "/" + database;
  connection = postgres(parsed.href, { max: 1, onnotice: () => undefined });
});
afterAll(async () => {
  await connection?.end();
  if (admin) {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  }
});
it.skipIf(!url)(
  "applies the complete fresh chain and preserves records on repeated migration",
  async () => {
    if (!connection) throw new Error("Missing migration fixture database");
    const options = { migrationsFolder: "drizzle" };
    await migrate(drizzle(connection), options);
    const id = randomUUID();
    await connection`INSERT INTO "read-it-later_user" (id,name,email,"emailVerified") VALUES ('migration-fixture','Migration fixture','migration@example.invalid',true)`;
    await connection`INSERT INTO "read-it-later_article" (id,"userId",url,title,content,"isFavorite") VALUES (${id},'migration-fixture','https://example.com/migration','Keep this fixture','<p>Preserve text and flags.</p>',true)`;
    await migrate(drizzle(connection), options);
    const [article] =
      await connection`SELECT title,content,"isFavorite" FROM "read-it-later_article" WHERE id=${id}`;
    expect(article).toEqual({
      title: "Keep this fixture",
      content: "<p>Preserve text and flags.</p>",
      isFavorite: true,
    });
    const [head] =
      await connection`SELECT revision::text FROM "read-it-later_native_library_owner" WHERE owner_id='migration-fixture'`;
    expect(Number(head?.revision)).toBeGreaterThan(0);
    const [count] =
      await connection`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`;
    expect(count?.count).toBe(readMigrationFiles(options).length);
  },
  30_000,
);
