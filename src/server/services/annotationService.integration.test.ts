import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Opt-in only. Never fall back to DATABASE_URL or load application env/config.
const fixtureUrl = process.env.ANNOTATION_TEST_DATABASE_URL;
const ids = {
  articleA: "00000000-0000-4000-8000-000000000001",
  articleA2: "00000000-0000-4000-8000-000000000002",
  articleB: "00000000-0000-4000-8000-000000000003",
  highlightA: "00000000-0000-4000-8000-000000000011",
  highlightA2: "00000000-0000-4000-8000-000000000012",
  highlightB: "00000000-0000-4000-8000-000000000013",
  legacyHighlight: "00000000-0000-4000-8000-000000000014",
  noteA: "00000000-0000-4000-8000-000000000021",
  legacyNote: "00000000-0000-4000-8000-000000000022",
  legacyArticleNote: "00000000-0000-4000-8000-000000000023",
  newRow: "00000000-0000-4000-8000-000000000099",
  missing: "00000000-0000-4000-8000-000000000098",
};

describe.skipIf(!fixtureUrl)(
  "annotation ownership migration (isolated local fixtures)",
  () => {
    const schema = `annotation_fixture_${randomUUID().replaceAll("-", "")}`;
    let connection: postgres.Sql | undefined;
    let createdSchema = false;
    let before: unknown;

    function sql() {
      if (!connection) throw new Error("Missing annotation fixture connection");
      return connection;
    }

    async function snapshot() {
      const db = sql();
      return {
        articles: [
          ...(await db`SELECT * FROM "read-it-later_article" ORDER BY id`),
        ],
        highlights: [
          ...(await db`SELECT * FROM "read-it-later_highlight" ORDER BY id`),
        ],
        notes: [...(await db`SELECT * FROM "read-it-later_note" ORDER BY id`)],
      };
    }

    // Each test rolls back its own synthetic mutations, including successful ones.
    async function isolated(
      run: (tx: postgres.TransactionSql) => Promise<void>,
    ) {
      const rollback = new Error("Rollback annotation fixture changes");
      try {
        await sql().begin(async (tx) => {
          await run(tx);
          throw rollback;
        });
      } catch (error) {
        if (error !== rollback) throw error;
      }
    }

    beforeAll(async () => {
      if (!fixtureUrl) throw new Error("Explicit local fixture URL required");
      const parsed = new URL(fixtureUrl);
      if (
        !["postgres:", "postgresql:"].includes(parsed.protocol) ||
        !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
        parsed.search
      ) {
        throw new Error(
          "Annotation fixtures require an explicit local PostgreSQL URL without connection overrides",
        );
      }
      connection = postgres(fixtureUrl, { max: 1, onnotice: () => undefined });
      await connection.unsafe(`CREATE SCHEMA "${schema}"`);
      createdSchema = true;
      await connection.unsafe(`SET search_path TO "${schema}"`);
      // Only this randomly named schema is read/written. These minimal tables
      // reproduce the existing primary/single-column foreign keys before 0016.
      await connection.unsafe(`
      CREATE TABLE "read-it-later_article" (
        id uuid PRIMARY KEY, "userId" text NOT NULL, content text NOT NULL
      );
      CREATE TABLE "read-it-later_highlight" (
        id uuid PRIMARY KEY, "userId" text NOT NULL,
        "articleId" uuid NOT NULL REFERENCES "read-it-later_article"(id) ON DELETE CASCADE,
        text text NOT NULL
      );
      CREATE TABLE "read-it-later_note" (
        id uuid PRIMARY KEY, "userId" text NOT NULL,
        "articleId" uuid NOT NULL REFERENCES "read-it-later_article"(id) ON DELETE CASCADE,
        "highlightId" uuid REFERENCES "read-it-later_highlight"(id) ON DELETE CASCADE,
        content text NOT NULL
      );
    `);
      await connection`INSERT INTO "read-it-later_article" VALUES
      (${ids.articleA}, 'alice', 'Synthetic A'), (${ids.articleA2}, 'alice', 'Synthetic A2'), (${ids.articleB}, 'bob', 'Synthetic B')`;
      await connection`INSERT INTO "read-it-later_highlight" VALUES
      (${ids.highlightA}, 'alice', ${ids.articleA}, 'Synthetic A'),
      (${ids.highlightA2}, 'alice', ${ids.articleA2}, 'Synthetic A2'),
      (${ids.highlightB}, 'bob', ${ids.articleB}, 'Synthetic B'),
      (${ids.legacyHighlight}, 'bob', ${ids.articleA}, 'Legacy synthetic mismatch')`;
      await connection`INSERT INTO "read-it-later_note" VALUES
      (${ids.noteA}, 'alice', ${ids.articleA}, ${ids.highlightA}, 'Synthetic valid'),
      (${ids.legacyNote}, 'alice', ${ids.articleA}, ${ids.highlightB}, 'Synthetic legacy highlight mismatch'),
      (${ids.legacyArticleNote}, 'alice', ${ids.articleB}, NULL, 'Synthetic legacy article mismatch')`;
      before = await snapshot();

      const migration = await readFile(
        "drizzle/0016_annotation_ownership.sql",
        "utf8",
      );
      // Production uses explicitly qualified public objects. Relocate only that
      // schema qualifier so the real SQL can run beside other agents' fixtures.
      for (const statement of migration
        .replaceAll("public.", `"${schema}".`)
        .split("--> statement-breakpoint")) {
        await connection.unsafe(statement);
      }
    });

    afterAll(async () => {
      if (connection) {
        if (createdSchema)
          await connection.unsafe(`DROP SCHEMA "${schema}" CASCADE`);
        await connection.end();
      }
    });

    it("preserves all existing synthetic rows and leaves the new foreign keys unvalidated", async () => {
      expect(await snapshot()).toEqual(before);
      const constraints =
        await sql()`SELECT conname, convalidated FROM pg_constraint
      WHERE connamespace = ${schema}::regnamespace AND contype = 'f' AND conname IN
      ('highlight_article_owner_fk', 'note_article_owner_fk', 'note_highlight_owner_article_fk') ORDER BY conname`;
      expect(constraints).toHaveLength(3);
      expect(constraints.every((row) => row.convalidated === false)).toBe(true);
    });

    it.each([ids.articleB, ids.missing])(
      "rejects a direct highlight insert for an unowned/missing article %s",
      async (articleId) => {
        await isolated(async (tx) => {
          await expect(
            tx.savepoint(async (sp) => {
              await sp`INSERT INTO "read-it-later_highlight" VALUES (${ids.newRow}, 'alice', ${articleId}, 'Synthetic')`;
            }),
          ).rejects.toMatchObject({ code: "23514" });
        });
      },
    );

    it.each([ids.articleB, ids.missing])(
      "rejects a standalone note for an unowned/missing article %s",
      async (articleId) => {
        await isolated(async (tx) => {
          await expect(
            tx.savepoint(async (sp) => {
              await sp`INSERT INTO "read-it-later_note" VALUES (${ids.newRow}, 'alice', ${articleId}, NULL, 'Synthetic')`;
            }),
          ).rejects.toMatchObject({ code: "23514" });
        });
      },
    );

    it.each([
      ids.highlightB,
      ids.highlightA2,
      ids.legacyHighlight,
      ids.missing,
    ])(
      "rejects mismatching highlight %s on insert and reassignment",
      async (highlightId) => {
        await isolated(async (tx) => {
          await expect(
            tx.savepoint(async (sp) => {
              await sp`INSERT INTO "read-it-later_note" VALUES (${ids.newRow}, 'alice', ${ids.articleA}, ${highlightId}, 'Synthetic')`;
            }),
          ).rejects.toMatchObject({ code: "23514" });
          await expect(
            tx.savepoint(async (sp) => {
              await sp`UPDATE "read-it-later_note" SET "highlightId" = ${highlightId} WHERE id = ${ids.noteA}`;
            }),
          ).rejects.toMatchObject({ code: "23514" });
        });
      },
    );

    it("accepts valid creation, detachment, and coordinated article/highlight reassignment", async () => {
      await isolated(async (tx) => {
        await tx`INSERT INTO "read-it-later_highlight" VALUES (${ids.newRow}, 'alice', ${ids.articleA}, 'Synthetic')`;
        await tx`INSERT INTO "read-it-later_note" VALUES (${ids.newRow}, 'alice', ${ids.articleA}, ${ids.newRow}, 'Synthetic')`;
        await tx`UPDATE "read-it-later_note" SET "highlightId" = NULL WHERE id = ${ids.newRow}`;
        await tx`UPDATE "read-it-later_note" SET "articleId" = ${ids.articleA2}, "highlightId" = ${ids.highlightA2} WHERE id = ${ids.newRow}`;
        expect(
          await tx`SELECT "articleId", "highlightId" FROM "read-it-later_note" WHERE id = ${ids.newRow}`,
        ).toEqual([{ articleId: ids.articleA2, highlightId: ids.highlightA2 }]);
      });
    });

    it("rejects changing annotation owners or articles to invalid parents", async () => {
      await isolated(async (tx) => {
        await expect(
          tx.savepoint(
            async (sp) =>
              sp`UPDATE "read-it-later_highlight" SET "userId" = 'bob' WHERE id = ${ids.highlightA}`,
          ),
        ).rejects.toMatchObject({ code: "23514" });
        await expect(
          tx.savepoint(
            async (sp) =>
              sp`UPDATE "read-it-later_highlight" SET "articleId" = ${ids.articleB} WHERE id = ${ids.highlightA}`,
          ),
        ).rejects.toMatchObject({ code: "23514" });
        await expect(
          tx.savepoint(
            async (sp) =>
              sp`UPDATE "read-it-later_note" SET "userId" = 'bob' WHERE id = ${ids.noteA}`,
          ),
        ).rejects.toMatchObject({ code: "23514" });
        await expect(
          tx.savepoint(
            async (sp) =>
              sp`UPDATE "read-it-later_note" SET "articleId" = ${ids.articleB}, "highlightId" = NULL WHERE id = ${ids.noteA}`,
          ),
        ).rejects.toMatchObject({ code: "23514" });
      });
    });

    it("prevents parent writes from invalidating existing valid children", async () => {
      await isolated(async (tx) => {
        await expect(
          tx.savepoint(
            async (sp) =>
              sp`UPDATE "read-it-later_article" SET "userId" = 'bob' WHERE id = ${ids.articleA}`,
          ),
        ).rejects.toMatchObject({ code: "23503" });
        await expect(
          tx.savepoint(
            async (sp) =>
              sp`UPDATE "read-it-later_highlight" SET "articleId" = ${ids.articleA2} WHERE id = ${ids.highlightA}`,
          ),
        ).rejects.toMatchObject({ code: "23503" });
        await expect(
          tx.savepoint(
            async (sp) =>
              sp`UPDATE "read-it-later_highlight" SET "userId" = 'bob', "articleId" = ${ids.articleB} WHERE id = ${ids.highlightA}`,
          ),
        ).rejects.toMatchObject({ code: "23503" });
      });
    });

    it("allows ordinary legacy edits and repairs without permitting new invalid relationships", async () => {
      await isolated(async (tx) => {
        await tx`UPDATE "read-it-later_highlight" SET text = 'Edited synthetic', "articleId" = "articleId" WHERE id = ${ids.legacyHighlight}`;
        await tx`UPDATE "read-it-later_note" SET content = 'Edited synthetic', "highlightId" = "highlightId" WHERE id IN (${ids.legacyNote}, ${ids.legacyArticleNote})`;
        await tx`UPDATE "read-it-later_note" SET "highlightId" = NULL WHERE id = ${ids.legacyNote}`;
        await tx`UPDATE "read-it-later_highlight" SET "userId" = 'alice' WHERE id = ${ids.legacyHighlight}`;
        await tx`UPDATE "read-it-later_note" SET "articleId" = ${ids.articleA} WHERE id = ${ids.legacyArticleNote}`;
        expect(
          await tx`SELECT "highlightId" FROM "read-it-later_note" WHERE id = ${ids.legacyNote}`,
        ).toEqual([{ highlightId: null }]);
      });
    });

    it.each(["article", "highlight"] as const)(
      "rejects a concurrent %s reassignment even with a stale repeatable-read snapshot",
      async (parentType) => {
        const db = sql();
        const articleId = randomUUID();
        const highlightId = randomUUID();
        const noteId = randomUUID();
        await db`INSERT INTO "read-it-later_article" VALUES (${articleId}, 'alice', 'Synthetic race fixture')`;
        if (parentType === "highlight") {
          await db`INSERT INTO "read-it-later_highlight" VALUES (${highlightId}, 'alice', ${articleId}, 'Synthetic race fixture')`;
        }

        // A separate local connection establishes its snapshot before a child
        // commits. Trigger-only parent checks can miss this child; the foreign
        // keys must reject the write or force a serialization retry instead.
        const parent = postgres(fixtureUrl!, {
          max: 1,
          onnotice: () => undefined,
        });
        try {
          await parent.unsafe(`SET search_path TO "${schema}"`);
          await parent`SET statement_timeout TO '3s'`;
          await expect(
            parent.begin("isolation level repeatable read", async (tx) => {
              await tx`SELECT id FROM "read-it-later_article" WHERE id = ${articleId}`;
              if (parentType === "article") {
                await db`INSERT INTO "read-it-later_highlight" VALUES (${highlightId}, 'alice', ${articleId}, 'Synthetic concurrent child')`;
                await tx`UPDATE "read-it-later_article" SET "userId" = 'bob' WHERE id = ${articleId}`;
              } else {
                await db`INSERT INTO "read-it-later_note" VALUES (${noteId}, 'alice', ${articleId}, ${highlightId}, 'Synthetic concurrent child')`;
                await tx`UPDATE "read-it-later_highlight" SET "articleId" = ${ids.articleA2} WHERE id = ${highlightId}`;
              }
            }),
          ).rejects.toHaveProperty(
            "code",
            expect.stringMatching(/^(23503|40001)$/),
          );
          expect(
            await db`SELECT "userId" FROM "read-it-later_article" WHERE id = ${articleId}`,
          ).toEqual([{ userId: "alice" }]);
          expect(
            await db`SELECT "articleId" FROM "read-it-later_highlight" WHERE id = ${highlightId}`,
          ).toEqual([{ articleId }]);
        } finally {
          await parent.end();
        }
      },
    );

    it("keeps the existing article/highlight delete cascades working", async () => {
      await isolated(async (tx) => {
        await tx`DELETE FROM "read-it-later_highlight" WHERE id = ${ids.highlightA}`;
        expect(
          await tx`SELECT id FROM "read-it-later_note" WHERE id = ${ids.noteA}`,
        ).toHaveLength(0);
        await tx`DELETE FROM "read-it-later_article" WHERE id = ${ids.articleA}`;
        expect(
          await tx`SELECT id FROM "read-it-later_highlight" WHERE "articleId" = ${ids.articleA}`,
        ).toHaveLength(0);
        expect(
          await tx`SELECT id FROM "read-it-later_note" WHERE "articleId" = ${ids.articleA}`,
        ).toHaveLength(0);
      });
    });
  },
);
