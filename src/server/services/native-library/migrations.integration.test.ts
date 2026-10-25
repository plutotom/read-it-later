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
    const highlightId = randomUUID();
    await connection`INSERT INTO "read-it-later_highlight" (id,"articleId","userId",text,"startOffset","endOffset",version,"anchorContentHash",anchor_status) VALUES (${highlightId},${id},'migration-fixture','Preserve',0,8,1,'legacy-hash','anchored')`;
    await connection`INSERT INTO "read-it-later_note" ("articleId","userId","highlightId",content) VALUES (${id},'migration-fixture',${highlightId},'Keep this independent note')`;
    const [highlight] =
      await connection`SELECT version,"anchorContentHash",anchor_status,"anchorSpace","sourceAnchor","webAnchor" FROM "read-it-later_highlight" WHERE id=${highlightId}`;
    expect(highlight).toEqual({
      version: 1,
      anchorContentHash: "legacy-hash",
      anchor_status: "anchored",
      anchorSpace: "web-dom-v1",
      sourceAnchor: null,
      webAnchor: null,
    });
    const identities =
      await connection`SELECT kind,deleted FROM "read-it-later_native_annotation" WHERE owner_id='migration-fixture' AND article_id=${id} ORDER BY kind`;
    expect(identities).toEqual([
      { kind: "highlight", deleted: false },
      { kind: "note", deleted: false },
    ]);
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
    await connection`DELETE FROM "read-it-later_highlight" WHERE id=${highlightId}`;
    const [attached] =
      await connection`SELECT count(*)::int AS count FROM "read-it-later_note" WHERE "highlightId"=${highlightId}`;
    expect(attached?.count).toBe(0);
    const childTombstones =
      await connection`SELECT kind,deleted FROM "read-it-later_native_annotation" WHERE owner_id='migration-fixture' AND article_id=${id} ORDER BY kind`;
    expect(childTombstones).toEqual([
      { kind: "highlight", deleted: true },
      { kind: "note", deleted: true },
    ]);
    const nextHighlight = randomUUID();
    await connection`INSERT INTO "read-it-later_highlight" (id,"articleId","userId",text,"startOffset","endOffset") VALUES (${nextHighlight},${id},'migration-fixture','text',9,13)`;
    await connection`INSERT INTO "read-it-later_note" ("articleId","userId",content) VALUES (${id},'migration-fixture','Standalone note')`;
    await connection`DELETE FROM "read-it-later_article" WHERE id=${id}`;
    const [children] =
      await connection`SELECT (SELECT count(*) FROM "read-it-later_highlight" WHERE "articleId"=${id})::int + (SELECT count(*) FROM "read-it-later_note" WHERE "articleId"=${id})::int AS count`;
    expect(children?.count).toBe(0);
    const [deleted] =
      await connection`SELECT deleted FROM "read-it-later_native_library_change" WHERE owner_id='migration-fixture' AND article_id=${id}`;
    expect(deleted?.deleted).toBe(true);
  },
  30_000,
);
