import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { nativeAuthOptions } from "~/server/native-auth-options";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import * as schema from "~/server/db/schema";
import { createHighlight, updateHighlight } from "../annotationService";
import { nativeLibraryDocumentFromHtml } from "~/lib/native-library-document";
import { findQuoteOffsets, hashAnchorText } from "~/lib/highlight-anchor";
import {
  NATIVE_ANNOTATION_COLORS,
  sourceAnchorSchema,
  type NativeAnnotationSnapshot,
} from "~/lib/native-annotations";
import {
  NATIVE_LIBRARY_ARTICLE_BYTES,
  NATIVE_LIBRARY_PAGE_BYTES,
} from "~/lib/native-library";
// Never instantiate the application DB or load env, even though services retain
// a production default. Every test call injects this private-schema connection.
const httpFixture = vi.hoisted(() => ({
  database: undefined as unknown,
  getSession: vi.fn(),
}));
vi.mock("~/server/db", () => ({
  get db() {
    return httpFixture.database;
  },
}));
vi.mock("~/server/auth", () => ({
  auth: { api: { getSession: httpFixture.getSession } },
}));
vi.mock("~/env", () => ({
  env: {
    AUTH_SECRET: "synthetic-fresh-annotation-http-secret-over-32-characters",
  },
}));
import {
  mutateNativeLibrary,
  pullNativeLibrary,
} from "../native-library/service";

const url = process.env.NATIVE_ANNOTATION_TEST_DATABASE_URL;
const secret = "synthetic-annotation-cursor-secret-over-32-characters";
const html = "<p>First 😀é paragraph.</p><p>Second paragraph.</p>";
const source = (text = "First", startOffset = 0) => ({
  space: "paper-drive-text-v1",
  text,
  startOffset,
  endOffset: startOffset + text.length,
  contextPrefix: "",
  contextSuffix: "",
  contentHash: nativeLibraryDocumentFromHtml(html).contentHash,
});
const mutation = <Fields extends Record<string, unknown>>(
  articleId: string,
  kind: string,
  fields: Fields,
) => ({ mutationId: randomUUID(), articleId, kind, ...fields });
function complete(snapshot: NativeAnnotationSnapshot | undefined) {
  if (!snapshot?.complete)
    throw new Error("Expected complete annotation fixture snapshot");
  return snapshot;
}

describe.skipIf(!url)(
  "native annotation protocol 2, private local PostgreSQL schema",
  () => {
    const name = `native_annotations_${randomUUID().replaceAll("-", "")}`;
    let connection: postgres.Sql;
    let database: ReturnType<typeof drizzle<typeof schema>>;
    const bootstrap = {
      article: randomUUID(),
      otherArticle: randomUUID(),
      highlight: randomUUID(),
      note: randomUUID(),
      badHighlight: randomUUID(),
      badNote: randomUUID(),
    };
    const mutate = (owner: string, ...mutations: unknown[]) =>
      mutateNativeLibrary(owner, { protocolVersion: 2, mutations }, database);
    const pull = (
      owner: string,
      cursor?: string,
      limit = 50,
      protocolVersion: 1 | 2 = 2,
    ) =>
      pullNativeLibrary(
        owner,
        { secret, cursor, limit, protocolVersion },
        database,
      );
    const fixture = async () => {
      const owner = `synthetic-${randomUUID()}`,
        articleId = randomUUID();
      await connection`INSERT INTO "read-it-later_user" VALUES (${owner})`;
      await connection`INSERT INTO "read-it-later_article" (id, "userId", url, title, content) VALUES (${articleId}, ${owner}, 'text://fixture', 'Synthetic', ${html})`;
      return { owner, articleId };
    };
    const note = (
      articleId: string,
      content = "Same text",
      highlightId?: string,
    ) =>
      mutation(articleId, "note.create", {
        noteId: randomUUID(),
        content,
        ...(highlightId ? { highlightId } : {}),
      });
    const highlight = (
      articleId: string,
      color = "yellow",
      anchor = source(),
    ) =>
      mutation(articleId, "highlight.create", {
        highlightId: randomUUID(),
        color,
        sourceAnchor: anchor,
      });
    beforeAll(async () => {
      if (!url) throw new Error("Explicit local annotation test URL required");
      const parsed = new URL(url);
      if (
        !["postgres:", "postgresql:"].includes(parsed.protocol) ||
        !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
        parsed.search
      )
        throw new Error(
          "NATIVE_ANNOTATION_TEST_DATABASE_URL must be a local PostgreSQL URL without overrides",
        );
      connection = postgres(url, {
        max: 10,
        connection: { search_path: name, statement_timeout: 10000 },
        onnotice: () => undefined,
      });
      await connection.unsafe(`CREATE SCHEMA "${name}"`);
      await connection.unsafe(`
      CREATE TABLE "read-it-later_user" (id text PRIMARY KEY);
      CREATE TABLE "read-it-later_article" (
        id uuid PRIMARY KEY, "userId" text NOT NULL REFERENCES "read-it-later_user"(id),
        url text NOT NULL, title text NOT NULL, content text NOT NULL,
        "isRead" boolean NOT NULL DEFAULT false, "isFavorite" boolean NOT NULL DEFAULT false,
        "isArchived" boolean NOT NULL DEFAULT false, metadata jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE "read-it-later_highlight" (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" text NOT NULL REFERENCES "read-it-later_user"(id),
        "articleId" uuid NOT NULL REFERENCES "read-it-later_article"(id) ON DELETE CASCADE,
        text text NOT NULL, "startOffset" integer NOT NULL, "endOffset" integer NOT NULL,
        color text NOT NULL DEFAULT 'yellow', "contextPrefix" text, "contextSuffix" text,
        version integer NOT NULL DEFAULT 1, "anchorContentHash" text, anchor_status text NOT NULL DEFAULT 'anchored', tags text[],
        "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE "read-it-later_note" (
        id uuid PRIMARY KEY, "userId" text NOT NULL REFERENCES "read-it-later_user"(id),
        "articleId" uuid NOT NULL REFERENCES "read-it-later_article"(id) ON DELETE CASCADE,
        "highlightId" uuid REFERENCES "read-it-later_highlight"(id) ON DELETE CASCADE,
        content text NOT NULL, position jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
      await connection`INSERT INTO "read-it-later_user" VALUES ('synthetic-bootstrap-a'), ('synthetic-bootstrap-b')`;
      await connection`INSERT INTO "read-it-later_article" (id, "userId", url, title, content) VALUES (${bootstrap.article}, 'synthetic-bootstrap-a', 'text://fixture', 'Before', ${html}), (${bootstrap.otherArticle}, 'synthetic-bootstrap-b', 'text://other', 'Other', ${html})`;
      await connection`INSERT INTO "read-it-later_highlight" (id, "userId", "articleId", text, "startOffset", "endOffset", "anchorContentHash") VALUES (${bootstrap.highlight}, 'synthetic-bootstrap-a', ${bootstrap.article}, 'First', 0, 5, ${hashAnchorText("First 😀é paragraph.Second paragraph.")}), (${bootstrap.badHighlight}, 'synthetic-bootstrap-b', ${bootstrap.article}, 'Legacy invalid', 0, 14, NULL)`;
      await connection`INSERT INTO "read-it-later_note" (id, "userId", "articleId", "highlightId", content) VALUES (${bootstrap.note}, 'synthetic-bootstrap-a', ${bootstrap.article}, ${bootstrap.highlight}, 'Historical attached'), (${bootstrap.badNote}, 'synthetic-bootstrap-a', ${bootstrap.article}, ${bootstrap.badHighlight}, 'Invalid historical relationship')`;
      for (const file of [
        "0015_native_library_sync",
        "0016_annotation_ownership",
        "0017_native_annotations",
      ]) {
        await connection.begin(async (tx) => {
          for (const statement of readFileSync(`drizzle/${file}.sql`, "utf8")
            .replaceAll("public.", `"${name}".`)
            .split("--> statement-breakpoint"))
            await tx.unsafe(statement);
        });
      }
      database = drizzle(connection, { schema });
    });
    afterAll(async () => {
      if (connection) {
        await connection.unsafe(`DROP SCHEMA "${name}" CASCADE`);
        await connection.end();
      }
    });

    it("bootstraps valid owned historical relationships without repairing legacy rows", async () => {
      const page = await pull("synthetic-bootstrap-a");
      const snapshot = complete(page.changes[0]?.annotations);
      expect(snapshot.notes.map((n) => n.id)).toEqual([bootstrap.note]);
      expect(snapshot.highlights.map((h) => h.id)).toEqual([
        bootstrap.highlight,
      ]);
      expect(snapshot.highlights[0]).toMatchObject({
        sourceAnchor: { space: "web-dom-v1" },
        canonicalAnchor: { text: "First", startOffset: 0, endOffset: 5 },
        resolution: "anchored",
      });
      expect(
        await connection`SELECT content FROM "read-it-later_note" WHERE id = ${bootstrap.badNote}`,
      ).toEqual([{ content: "Invalid historical relationship" }]);
      expect(
        await connection`SELECT id FROM "read-it-later_native_annotation" WHERE id IN (${bootstrap.badNote}, ${bootstrap.badHighlight})`,
      ).toHaveLength(0);
      expect(
        (await pull("synthetic-bootstrap-a", undefined, 50, 1)).changes[0],
      ).not.toHaveProperty("annotations");
    });
    it("exports null-hash legacy web sources with an explicit unknown hash without pinning the feed", async () => {
      const f = await fixture(),
        id = randomUUID();
      const before = await pull(f.owner);
      await connection`INSERT INTO "read-it-later_highlight" (id, "userId", "articleId", text, "startOffset", "endOffset") VALUES (${id}, ${f.owner}, ${f.articleId}, 'First', 99, 104)`;
      const page = await pull(f.owner, before.cursor);
      const h = complete(page.changes[0]?.annotations).highlights[0]!;
      expect(h).toMatchObject({
        id,
        sourceAnchor: {
          space: "web-dom-v1",
          contentHash: "",
          startOffset: 99,
          endOffset: 104,
        },
        canonicalAnchor: { text: "First", startOffset: 0, endOffset: 5 },
        resolution: "anchored",
      });
      expect(sourceAnchorSchema.safeParse(h.sourceAnchor).success).toBe(true);
      expect((await pull(f.owner, page.cursor)).changes).toEqual([]);
      expect(
        await connection`SELECT "anchorContentHash", "sourceAnchor", "startOffset" FROM "read-it-later_highlight" WHERE id = ${id}`,
      ).toEqual([
        { anchorContentHash: null, sourceAnchor: null, startOffset: 99 },
      ]);
    });

    it("syncs independent and attached notes, every color, and verified separate web projections", async () => {
      const f = await fixture();
      const highlights = NATIVE_ANNOTATION_COLORS.map((color) =>
        highlight(f.articleId, color),
      );
      await mutate(f.owner, ...highlights);
      const notes = [
        note(f.articleId),
        note(f.articleId),
        note(f.articleId, "Attached", highlights[0]!.highlightId as string),
      ];
      await mutate(f.owner, ...notes);
      const snapshot = complete((await pull(f.owner)).changes[0]?.annotations);
      expect(snapshot.notes).toHaveLength(3);
      expect(new Set(snapshot.notes.map((n) => n.id)).size).toBe(3);
      expect(snapshot.highlights.map((h) => h.color).sort()).toEqual(
        [...NATIVE_ANNOTATION_COLORS].sort(),
      );
      expect(
        snapshot.highlights.every(
          (h) =>
            h.resolution === "anchored" && h.canonicalAnchor?.text === "First",
        ),
      ).toBe(true);
      const [stored] =
        await connection`SELECT "anchorSpace", "sourceAnchor", "webAnchor", text, "anchorContentHash" FROM "read-it-later_highlight" WHERE id = ${highlights[0]!.highlightId as string}`;
      expect(stored).toMatchObject({
        anchorSpace: "paper-drive-text-v1",
        sourceAnchor: source(),
        text: "First",
        anchorContentHash: source().contentHash,
        webAnchor: {
          text: "First",
          startOffset: 0,
          endOffset: 5,
          contentHash: hashAnchorText("First 😀é paragraph.Second paragraph."),
        },
      });
      expect(stored!.webAnchor).not.toHaveProperty("anchorContentHash");
    });
    it("captures raw web writes, patches only named fields, and preserves parent content/time/listening revision", async () => {
      const f = await fixture(),
        id = randomUUID();
      const before = await pull(f.owner);
      const [parentBefore] =
        await connection`SELECT * FROM "read-it-later_article" WHERE id = ${f.articleId}`;
      await connection`INSERT INTO "read-it-later_note" (id, "userId", "articleId", content, position) VALUES (${id}, ${f.owner}, ${f.articleId}, 'Original', '{"x":1,"y":2}')`;
      const created = await pull(f.owner, before.cursor);
      expect(complete(created.changes[0]?.annotations).notes[0]?.content).toBe(
        "Original",
      );
      await mutate(
        f.owner,
        mutation(f.articleId, "note.update", {
          noteId: id,
          patch: { content: "Changed" },
        }),
      );
      expect(
        await connection`SELECT content, position FROM "read-it-later_note" WHERE id = ${id}`,
      ).toEqual([{ content: "Changed", position: { x: 1, y: 2 } }]);
      const h = highlight(f.articleId);
      await mutate(f.owner, h);
      await connection`UPDATE "read-it-later_highlight" SET tags = ARRAY['keep'] WHERE id = ${h.highlightId as string}`;
      const [highlightBefore] =
        await connection`SELECT * FROM "read-it-later_highlight" WHERE id = ${h.highlightId as string}`;
      await mutate(
        f.owner,
        mutation(f.articleId, "highlight.update", {
          highlightId: h.highlightId,
          patch: { color: "red" },
        }),
      );
      const [highlightAfter] =
        await connection`SELECT * FROM "read-it-later_highlight" WHERE id = ${h.highlightId as string}`;
      expect(highlightAfter).toEqual({
        ...highlightBefore,
        color: "red",
        updatedAt: expect.any(String) as string,
      });
      const [parentAfter] =
        await connection`SELECT * FROM "read-it-later_article" WHERE id = ${f.articleId}`;
      expect(parentAfter).toEqual(parentBefore);
      expect(
        nativeLibraryDocumentFromHtml(parentAfter!.content as string).revision,
      ).toBe(
        nativeLibraryDocumentFromHtml(parentBefore!.content as string).revision,
      );
      expect((await pull(f.owner, created.cursor)).changes).toHaveLength(1);
    });
    it("preserves original web selectors across whitespace relocation and exports malformed legacy ranges without guessing", async () => {
      const f = await fixture();
      const oldDom = "Prefix a   b suffix.",
        nextDom = "Moved: Prefix a b suffix.";
      await connection`UPDATE "read-it-later_article" SET content = ${`<p>${oldDom}</p>`} WHERE id = ${f.articleId}`;
      const original = {
        space: "web-dom-v1",
        text: "a   b",
        startOffset: 7,
        endOffset: 12,
        contextPrefix: "Prefix ",
        contextSuffix: " suffix.",
        contentHash: hashAnchorText(oldDom),
      };
      const created = await createHighlight(database, f.owner, {
        articleId: f.articleId,
        text: original.text,
        startOffset: original.startOffset,
        endOffset: original.endOffset,
        contextPrefix: original.contextPrefix,
        contextSuffix: original.contextSuffix,
        anchorContentHash: original.contentHash,
      });
      const legacy = randomUUID(),
        malformed = randomUUID();
      await connection`INSERT INTO "read-it-later_highlight" (id, "userId", "articleId", text, "startOffset", "endOffset", "contextPrefix", "contextSuffix", "anchorContentHash") VALUES
        (${legacy}, ${f.owner}, ${f.articleId}, ${original.text}, 7, 12, ${original.contextPrefix}, ${original.contextSuffix}, ${original.contentHash}),
        (${malformed}, ${f.owner}, ${f.articleId}, ${original.text}, 7, 10, ${original.contextPrefix}, ${original.contextSuffix}, ${original.contentHash})`;
      await connection`UPDATE "read-it-later_article" SET content = ${`<p>${nextDom}</p>`} WHERE id = ${f.articleId}`;
      const found = findQuoteOffsets(nextDom, original);
      expect(found).toEqual({
        start: nextDom.indexOf("a b"),
        end: nextDom.indexOf("a b") + 3,
      });
      if (!found) throw new Error("Expected unique web whitespace relocation");
      for (const id of [created.id, legacy, malformed])
        await updateHighlight(database, f.owner, id, {
          startOffset: found.start,
          endOffset: found.end,
          anchorContentHash: hashAnchorText(nextDom),
          anchorStatus: "anchored",
        });
      const moved = complete((await pull(f.owner)).changes[0]?.annotations);
      for (const id of [created.id, legacy]) {
        const h = moved.highlights.find((row) => row.id === id)!;
        expect(h.sourceAnchor).toEqual(original);
        expect(sourceAnchorSchema.safeParse(h.sourceAnchor).success).toBe(true);
        expect(h).toMatchObject({
          canonicalAnchor: null,
          resolution: "unresolved",
        });
      }
      expect(
        moved.highlights.find((row) => row.id === malformed),
      ).toMatchObject({
        sourceAnchor: { ...original, endOffset: 10 },
        canonicalAnchor: null,
        resolution: "unresolved",
      });
      // Another relocation must keep even the malformed historical source verbatim.
      for (const id of [created.id, legacy, malformed])
        await updateHighlight(database, f.owner, id, {
          startOffset: found.start + 1,
          endOffset: found.end + 1,
          anchorContentHash: "0".repeat(14),
        });
      const final = complete((await pull(f.owner)).changes[0]?.annotations);
      expect(final.highlights.map((h) => h.sourceAnchor)).toEqual(
        moved.highlights.map((h) => h.sourceAnchor),
      );
      expect(
        (await pull(f.owner, (await pull(f.owner)).cursor)).changes,
      ).toEqual([]);
    });

    it.each([
      ["prefix boundary", `😀${"a".repeat(31)}quote`, "a".repeat(31), ""],
      ["suffix boundary", `quote${"a".repeat(31)}😀`, "", "a".repeat(31)],
      [
        "complete prefix emoji",
        `😀${"a".repeat(30)}quote`,
        `😀${"a".repeat(30)}`,
        "",
      ],
      [
        "complete suffix emoji",
        `quote${"a".repeat(30)}😀`,
        "",
        `${"a".repeat(30)}😀`,
      ],
    ])(
      "stores valid JSONB web projections at UTF-16 context %s",
      async (_label, text, contextPrefix, contextSuffix) => {
        const f = await fixture(),
          content = `<p>${text}</p>`,
          startOffset = text.indexOf("quote");
        await connection`UPDATE "read-it-later_article" SET content = ${content} WHERE id = ${f.articleId}`;
        const anchor = {
          ...source("quote", startOffset),
          contentHash: nativeLibraryDocumentFromHtml(content).contentHash,
        };
        const h = highlight(f.articleId, "purple", anchor);
        await mutate(f.owner, h);
        const [stored] =
          await connection`SELECT "sourceAnchor", "webAnchor" FROM "read-it-later_highlight" WHERE id = ${h.highlightId}`;
        expect(stored).toEqual({
          sourceAnchor: anchor,
          webAnchor: {
            text: "quote",
            startOffset,
            endOffset: startOffset + 5,
            contentHash: hashAnchorText(text),
            contextPrefix,
            contextSuffix,
          },
        });
      },
    );

    it("persists per-effect annotation revision fences through A to B to A, no-ops and receipt replay", async () => {
      const f = await fixture(),
        n = note(f.articleId, "A");
      const first = await mutate(f.owner, n);
      expect(first.results[0]?.effectRevision).toBe("2");
      const middle = mutation(f.articleId, "note.update", {
        noteId: n.noteId,
        patch: { content: "B" },
      });
      const last = mutation(f.articleId, "note.update", {
        noteId: n.noteId,
        patch: { content: "A" },
      });
      const changes = await mutate(f.owner, middle, last);
      expect(changes.results.map((result) => result.effectRevision)).toEqual([
        "3",
        "4",
      ]);
      expect(changes).not.toHaveProperty("cursor");
      const current = await pull(f.owner);
      expect(current.changes[0]?.revision).toBe("4");
      expect(complete(current.changes[0]?.annotations).notes[0]?.content).toBe(
        "A",
      );
      const noOp = await mutate(f.owner, { ...n, mutationId: randomUUID() });
      expect(noOp.results[0]?.effectRevision).toBe("4");
      expect((await pull(f.owner, current.cursor)).changes).toEqual([]);
      await connection`UPDATE "read-it-later_article" SET title = 'Unrelated later change' WHERE id = ${f.articleId}`;
      expect(await mutate(f.owner, n)).toEqual(first);
      expect(await mutate(f.owner, middle, last)).toEqual(changes);
      expect(
        await connection`SELECT result FROM "read-it-later_native_library_mutation" WHERE owner_id = ${f.owner} AND mutation_id = ${n.mutationId}`,
      ).toEqual([{ result: first.results[0] }]);
      await expect(
        mutate(f.owner, {
          ...last,
          patch: { content: "Different receipt reuse" },
        }),
      ).rejects.toMatchObject({ code: "mutation_conflict" });
      const v1 = await mutateNativeLibrary(
        f.owner,
        {
          protocolVersion: 1,
          mutations: [
            mutation(f.articleId, "update", { patch: { isRead: true } }),
          ],
        },
        database,
      );
      expect(v1.results[0]).not.toHaveProperty("effectRevision");
      const v2Article = await mutate(
        f.owner,
        mutation(f.articleId, "update", { patch: { isRead: false } }),
      );
      expect(v2Article.results[0]).not.toHaveProperty("effectRevision");
    });

    it("fences deleted/no-op annotation results at the current owner revision and retains the original receipt fence", async () => {
      const f = await fixture(),
        n = note(f.articleId);
      await mutate(f.owner, n);
      const deletion = mutation(f.articleId, "note.delete", {
        noteId: n.noteId,
      });
      const deleted = await mutate(f.owner, deletion);
      expect(deleted.results[0]?.effectRevision).toBe("3");
      await connection`UPDATE "read-it-later_article" SET title = 'Current owner state' WHERE id = ${f.articleId}`;
      const stale = mutation(f.articleId, "note.update", {
        noteId: n.noteId,
        patch: { content: "Cannot resurrect" },
      });
      const noOp = await mutate(f.owner, stale);
      expect(noOp.results[0]).toMatchObject({
        status: "deleted",
        articleId: f.articleId,
        annotationId: n.noteId,
        effectRevision: "4",
      });
      const before = await pull(f.owner);
      expect(await mutate(f.owner, deletion)).toEqual(deleted);
      expect(
        (await mutate(f.owner, { ...deletion, mutationId: randomUUID() }))
          .results[0]?.effectRevision,
      ).toBe("4");
      expect((await pull(f.owner, before.cursor)).changes).toEqual([]);
      await connection`UPDATE "read-it-later_article" SET title = 'Even newer state' WHERE id = ${f.articleId}`;
      expect(await mutate(f.owner, stale)).toEqual(noOp);
      const emptyOwner = `synthetic-empty-${randomUUID()}`;
      await connection`INSERT INTO "read-it-later_user" VALUES (${emptyOwner})`;
      const missing = await mutate(
        emptyOwner,
        mutation(randomUUID(), "note.delete", { noteId: randomUUID() }),
      );
      expect(missing.results[0]?.effectRevision).toBe("0");
    });

    it.each(["note", "highlight"] as const)(
      "classifies %s deletion receipts by owned physical identity and preserves classification across later moves",
      async (kind) => {
        const f = await fixture(),
          second = randomUUID();
        await connection`INSERT INTO "read-it-later_article" (id, "userId", url, title, content) VALUES (${second}, ${f.owner}, 'text://second', 'Second parent', ${html})`;
        const create =
          kind === "note" ? note(f.articleId) : highlight(f.articleId);
        const annotationId =
          "noteId" in create ? create.noteId : create.highlightId;
        const fields =
          kind === "note"
            ? { noteId: annotationId }
            : { highlightId: annotationId };
        const applied = await mutate(f.owner, create);
        expect(applied.results[0]).not.toHaveProperty("permanentDeletion");
        const foreign = await fixture();
        await expect(
          mutate(foreign.owner, {
            ...create,
            articleId: foreign.articleId,
            mutationId: randomUUID(),
          }),
        ).rejects.toMatchObject({ code: "annotation_conflict" });
        const move = async (articleId: string) => {
          if (kind === "note")
            await connection`UPDATE "read-it-later_note" SET "articleId" = ${articleId} WHERE id = ${annotationId}`;
          else
            await connection`UPDATE "read-it-later_highlight" SET "articleId" = ${articleId} WHERE id = ${annotationId}`;
        };
        await move(second);
        const oldParentDelete = mutation(f.articleId, `${kind}.delete`, fields);
        const oldParent = await mutate(f.owner, oldParentDelete);
        expect(oldParent.results[0]).toMatchObject({
          status: "deleted",
          articleId: f.articleId,
          annotationId,
          permanentDeletion: false,
        });
        const [atMove] =
          await connection`SELECT revision::text FROM "read-it-later_native_library_owner" WHERE owner_id = ${f.owner}`;
        expect(oldParent.results[0]?.effectRevision).toBe(atMove!.revision);
        // A -> B -> A wholly between pulls must not change this old ACK's meaning.
        await move(f.articleId);
        expect(await mutate(f.owner, oldParentDelete)).toEqual(oldParent);
        const restored = complete(
          (await pull(f.owner)).changes.find((row) => row.id === f.articleId)
            ?.annotations,
        );
        expect(restored.highlights.length + restored.notes.length).toBe(1);
        const currentDelete = mutation(f.articleId, `${kind}.delete`, fields);
        const deleted = await mutate(f.owner, currentDelete);
        expect(deleted.results[0]).toMatchObject({
          status: "deleted",
          annotationId,
          permanentDeletion: true,
        });
        expect(await mutate(f.owner, oldParentDelete)).toEqual(oldParent);
        expect(await mutate(f.owner, currentDelete)).toEqual(deleted);
        const noOp = await mutate(
          f.owner,
          mutation(f.articleId, `${kind}.delete`, fields),
        );
        expect(noOp.results[0]).toMatchObject({
          status: "deleted",
          permanentDeletion: true,
        });
        const unknownId = randomUUID();
        const unknown = await mutate(
          f.owner,
          mutation(
            f.articleId,
            `${kind}.delete`,
            kind === "note"
              ? { noteId: unknownId }
              : { highlightId: unknownId },
          ),
        );
        expect(unknown.results[0]).toMatchObject({
          status: "deleted",
          annotationId: unknownId,
          permanentDeletion: true,
        });
        const missingParent = await mutate(
          f.owner,
          mutation(
            randomUUID(),
            `${kind}.delete`,
            kind === "note"
              ? { noteId: randomUUID() }
              : { highlightId: randomUUID() },
          ),
        );
        expect(missingParent.results[0]).toMatchObject({
          status: "deleted",
          permanentDeletion: true,
        });
        for (const response of [oldParent, deleted, unknown, missingParent])
          expect(response).not.toHaveProperty("cursor");
        expect(
          await connection`SELECT result FROM "read-it-later_native_library_mutation" WHERE owner_id = ${f.owner} AND mutation_id = ${oldParentDelete.mutationId}`,
        ).toEqual([{ result: oldParent.results[0] }]);
        const article = await mutateNativeLibrary(
          f.owner,
          {
            protocolVersion: 1,
            mutations: [
              mutation(f.articleId, "update", { patch: { isRead: true } }),
            ],
          },
          database,
        );
        expect(article.results[0]).not.toHaveProperty("permanentDeletion");
      },
    );

    it("replays lost/concurrent ACKs without writes, rejects changed-input reuse, and rolls back a conflicting batch", async () => {
      const f = await fixture(),
        n = note(f.articleId);
      const results = await Promise.all(
        Array.from({ length: 5 }, () => mutate(f.owner, n)),
      );
      for (const result of results) expect(result).toEqual(results[0]);
      const after = await pull(f.owner);
      await expect(
        mutate(f.owner, { ...n, content: "Changed" }),
      ).rejects.toMatchObject({ code: "mutation_conflict" });
      await mutate(f.owner, Object.fromEntries(Object.entries(n).reverse()));
      expect((await pull(f.owner, after.cursor)).changes).toEqual([]);
      const another = note(f.articleId);
      await expect(
        mutate(f.owner, another, { ...another, content: "Conflict" }),
      ).rejects.toMatchObject({ code: "mutation_conflict" });
      expect(
        await connection`SELECT id FROM "read-it-later_note" WHERE id = ${another.noteId as string}`,
      ).toHaveLength(0);
      expect((await pull(f.owner, after.cursor)).changes).toEqual([]);
    });
    it("preserves deletion IDs through highlight/note and article cascades, and stale mutations cannot resurrect", async () => {
      const f = await fixture(),
        h = highlight(f.articleId);
      await mutate(f.owner, h);
      const n = note(f.articleId, "Attached", h.highlightId as string),
        standalone = note(f.articleId);
      await mutate(f.owner, n, standalone);
      const before = await pull(f.owner);
      await connection`DELETE FROM "read-it-later_highlight" WHERE id = ${h.highlightId as string}`;
      const after = await pull(f.owner, before.cursor);
      const snapshot = complete(after.changes[0]?.annotations);
      expect(snapshot.deleted).toEqual(
        expect.arrayContaining([
          { kind: "highlight", id: h.highlightId },
          { kind: "note", id: n.noteId },
        ]),
      );
      expect(snapshot.notes.map((row) => row.id)).toEqual([standalone.noteId]);
      for (const stale of [
        { ...h, mutationId: randomUUID() },
        { ...n, mutationId: randomUUID() },
        mutation(f.articleId, "note.update", {
          noteId: n.noteId,
          patch: { content: "Stale" },
        }),
      ]) {
        const result = await mutate(f.owner, stale);
        expect(result.results[0]).toMatchObject({
          articleId: f.articleId,
          status: "deleted",
          annotationId: expect.any(String) as string,
        });
      }
      expect((await pull(f.owner, after.cursor)).changes).toEqual([]);
      await expect(
        connection`INSERT INTO "read-it-later_note" (id, "userId", "articleId", content) VALUES (${n.noteId as string}, ${f.owner}, ${f.articleId}, 'Stale raw')`,
      ).rejects.toMatchObject({ code: "23514" });
      await connection`DELETE FROM "read-it-later_article" WHERE id = ${f.articleId}`;
      const gone = await pull(f.owner, after.cursor);
      expect(gone.changes).toEqual([
        {
          id: f.articleId,
          revision: expect.any(String) as string,
          deleted: true,
          article: null,
        },
      ]);
      expect(
        await connection`SELECT deleted FROM "read-it-later_native_annotation" WHERE id = ${standalone.noteId as string}`,
      ).toEqual([{ deleted: true }]);
      const child = await mutate(f.owner, {
        ...standalone,
        mutationId: randomUUID(),
      });
      expect(child.results[0]?.annotationId).toBe(standalone.noteId);
      expect((await pull(f.owner, gone.cursor)).changes).toEqual([]);
    });
    it("persists an unknown child deletion and lets tombstones beat a later offline create", async () => {
      const f = await fixture(),
        n = note(f.articleId);
      const deleted = await mutate(
        f.owner,
        mutation(f.articleId, "note.delete", { noteId: n.noteId }),
      );
      expect(deleted.results[0]).toMatchObject({
        status: "deleted",
        annotationId: n.noteId,
        articleId: f.articleId,
      });
      expect((await mutate(f.owner, n)).results[0]?.status).toBe("deleted");
      const snapshot = complete((await pull(f.owner)).changes[0]?.annotations);
      expect(snapshot.notes).toEqual([]);
      expect(snapshot.deleted).toEqual([{ kind: "note", id: n.noteId }]);
    });
    it("invalidates both parents on relationship moves using OLD tombstones", async () => {
      const f = await fixture(),
        second = randomUUID(),
        n = note(f.articleId);
      await connection`INSERT INTO "read-it-later_article" (id, "userId", url, title, content) VALUES (${second}, ${f.owner}, 'text://second', 'Second', ${html})`;
      await mutate(f.owner, n);
      const before = await pull(f.owner);
      await connection`UPDATE "read-it-later_note" SET "articleId" = ${second} WHERE id = ${n.noteId as string}`;
      const page = await pull(f.owner, before.cursor);
      expect(page.changes).toHaveLength(2);
      expect(
        complete(page.changes.find((c) => c.id === f.articleId)?.annotations)
          .deleted,
      ).toContainEqual({ kind: "note", id: n.noteId });
      expect(
        complete(page.changes.find((c) => c.id === second)?.annotations)
          .notes[0]?.id,
      ).toBe(n.noteId);
    });
    it("allows updates at the new parent after a raw highlight owner/relationship move", async () => {
      const f = await fixture(),
        other = await fixture(),
        h = highlight(f.articleId);
      await mutate(f.owner, h);
      const beforeA = await pull(f.owner),
        beforeB = await pull(other.owner);
      await connection`UPDATE "read-it-later_highlight" SET "userId" = ${other.owner}, "articleId" = ${other.articleId} WHERE id = ${h.highlightId}`;
      expect(
        complete((await pull(f.owner, beforeA.cursor)).changes[0]?.annotations)
          .deleted,
      ).toContainEqual({ kind: "highlight", id: h.highlightId });
      expect(
        complete(
          (await pull(other.owner, beforeB.cursor)).changes[0]?.annotations,
        ).highlights[0]?.id,
      ).toBe(h.highlightId);
      await mutate(
        other.owner,
        mutation(other.articleId, "highlight.update", {
          highlightId: h.highlightId,
          patch: { color: "gray" },
        }),
      );
      expect(
        complete((await pull(other.owner)).changes[0]?.annotations)
          .highlights[0]?.color,
      ).toBe("gray");
      // OLD owner's offline create remains deleted, even though a live row now
      // belongs elsewhere. It never follows that row to the other account.
      expect(
        (await mutate(f.owner, { ...h, mutationId: randomUUID() })).results[0]
          ?.status,
      ).toBe("deleted");
    });

    it("serializes annotation revisions until commit alongside raw web writers", async () => {
      const f = await fixture();
      let ready!: () => void, release!: () => void;
      const entered = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const unblock = new Promise<void>((resolve) => {
        release = resolve;
      });
      const commits: string[] = [];
      const first = connection
        .begin(async (tx) => {
          await tx`INSERT INTO "read-it-later_note" (id, "userId", "articleId", content) VALUES (${randomUUID()}, ${f.owner}, ${f.articleId}, 'First uncommitted')`;
          ready();
          await unblock;
        })
        .then(() => commits.push("first"));
      await entered;
      const second = connection
        .begin(async (tx) => {
          await tx`INSERT INTO "read-it-later_note" (id, "userId", "articleId", content) VALUES (${randomUUID()}, ${f.owner}, ${f.articleId}, 'Second')`;
        })
        .then(() => commits.push("second"));
      try {
        const during = await pull(f.owner);
        expect(during.changes[0]?.revision).toBe("1");
        expect(complete(during.changes[0]?.annotations).notes).toEqual([]);
      } finally {
        release();
      }
      await Promise.all([first, second]);
      expect(commits).toEqual(["first", "second"]);
      const after = await pull(f.owner);
      expect(after.changes[0]?.revision).toBe("3");
      expect(complete(after.changes[0]?.annotations).notes).toHaveLength(2);
    });

    it("isolates UUID collisions, ownership, aliases and attached relationships", async () => {
      const f = await fixture(),
        other = await fixture(),
        n = note(f.articleId),
        h = highlight(f.articleId);
      await mutate(f.owner, n, h);
      const before = await pull(f.owner);
      await expect(
        mutate(other.owner, {
          ...n,
          articleId: other.articleId,
          mutationId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "annotation_conflict" });
      await expect(
        mutate(
          other.owner,
          note(other.articleId, "No cross account", h.highlightId as string),
        ),
      ).rejects.toMatchObject({ code: "invalid_annotation_relationship" });
      await expect(
        mutate(f.owner, note(other.articleId, "Foreign parent")),
      ).resolves.toMatchObject({
        results: [
          { status: "deleted", annotationId: expect.any(String) as string },
        ],
      });
      expect((await pull(f.owner, before.cursor)).changes).toEqual([]);
      expect(
        complete((await pull(other.owner)).changes[0]?.annotations).notes,
      ).toEqual([]);
      const aliasId = randomUUID();
      await mutate(
        f.owner,
        mutation(aliasId, "create", {
          url: "https://example.com/dedup",
          title: "Alias",
          text: "",
          isRead: false,
          isFavorite: false,
        }),
      );
      const local = randomUUID();
      await mutate(
        f.owner,
        mutation(local, "create", {
          url: "https://example.com/dedup",
          title: "Alias",
          text: "",
          isRead: false,
          isFavorite: false,
        }),
      );
      const aliased = await mutate(f.owner, note(local));
      expect(aliased.results[0]?.articleId).toBe(aliasId);
    });
    it("does not export guessed anchors for ambiguous web quotes or mismatched native hashes", async () => {
      const f = await fixture();
      await connection`UPDATE "read-it-later_article" SET content = '<p>x quote y x quote y</p>' WHERE id = ${f.articleId}`;
      const id = randomUUID();
      await connection`INSERT INTO "read-it-later_highlight" (id, "userId", "articleId", text, "startOffset", "endOffset", "contextPrefix", "contextSuffix") VALUES (${id}, ${f.owner}, ${f.articleId}, 'quote', 99, 104, 'x ', ' y')`;
      await mutate(f.owner, highlight(f.articleId));
      const snapshot = complete((await pull(f.owner)).changes[0]?.annotations);
      expect(
        snapshot.highlights.every(
          (h) => h.resolution === "unresolved" && h.canonicalAnchor === null,
        ),
      ).toBe(true);
    });
    it("returns explicit unavailable snapshots with no collections when notes, tombstones or combined article exceed 1MiB", async () => {
      const f = await fixture();
      const n = note(f.articleId);
      await mutate(f.owner, n);
      const before = await pull(f.owner);
      await connection`UPDATE "read-it-later_note" SET content = ${"\\".repeat(600_000)} WHERE id = ${n.noteId as string}`;
      const page = await pull(f.owner, before.cursor);
      expect(page.changes[0]?.annotations).toEqual({
        complete: false,
        reason: "annotation_limit",
      });
      expect(
        Buffer.byteLength(JSON.stringify(page.changes[0])),
      ).toBeLessThanOrEqual(NATIVE_LIBRARY_ARTICLE_BYTES);
      expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(
        NATIVE_LIBRARY_PAGE_BYTES,
      );
      await connection`UPDATE "read-it-later_note" SET content = 'Recovered' WHERE id = ${n.noteId as string}`;
      expect(
        complete((await pull(f.owner, page.cursor)).changes[0]?.annotations)
          .notes[0]?.content,
      ).toBe("Recovered");
      await connection`UPDATE "read-it-later_article" SET content = ${`<p>${"x".repeat(950_000)}</p>`} WHERE id = ${f.articleId}`;
      await connection`UPDATE "read-it-later_note" SET content = ${"n".repeat(120_000)} WHERE id = ${n.noteId as string}`;
      const combined = await pull(f.owner);
      expect(combined.changes[0]?.article?.text).toHaveLength(950_000);
      expect(combined.changes[0]?.annotations).toEqual({
        complete: false,
        reason: "annotation_limit",
      });
      await connection`DELETE FROM "read-it-later_note" WHERE id = ${n.noteId as string}`;
      await connection`INSERT INTO "read-it-later_native_annotation" (owner_id, kind, id, article_id, deleted) SELECT ${f.owner}, 'note', md5(i::text)::uuid, ${f.articleId}, true FROM generate_series(1, 20000) i`;
      expect((await pull(f.owner)).changes[0]?.annotations).toEqual({
        complete: false,
        reason: "annotation_limit",
      });
    }, 30_000);
    it("exports source quotes unresolved when the wire article content is unavailable", async () => {
      const f = await fixture(),
        h = highlight(f.articleId),
        n = note(f.articleId);
      await mutate(f.owner, h, n);
      await connection`UPDATE "read-it-later_article" SET url = 'ftp://example.com/legacy' WHERE id = ${f.articleId}`;
      const c = (await pull(f.owner)).changes[0]!;
      expect(c.article).toMatchObject({ contentUnavailable: true, text: "" });
      const snapshot = complete(c.annotations);
      expect(snapshot.notes[0]?.id).toBe(n.noteId);
      expect(snapshot.highlights[0]).toMatchObject({
        sourceAnchor: source(),
        canonicalAnchor: null,
        resolution: "unresolved",
      });
      expect(
        await connection`SELECT content FROM "read-it-later_article" WHERE id = ${f.articleId}`,
      ).toEqual([{ content: html }]);
    });

    it("bounds the final unavailable envelope at the exact article byte edge", async () => {
      const f = await fixture(),
        h = highlight(f.articleId);
      await mutate(f.owner, h);
      const base = (await pull(f.owner, undefined, 50, 1)).changes[0]!;
      const textLength =
        NATIVE_LIBRARY_ARTICLE_BYTES -
        5 -
        Buffer.byteLength(
          JSON.stringify({ ...base, article: { ...base.article!, text: "" } }),
        );
      await connection`UPDATE "read-it-later_article" SET content = ${`<p>${"x".repeat(textLength)}</p>`} WHERE id = ${f.articleId}`;
      const v1 = (await pull(f.owner, undefined, 50, 1)).changes[0]!;
      expect(v1.article).not.toHaveProperty("contentUnavailable");
      expect(Buffer.byteLength(JSON.stringify(v1))).toBe(
        NATIVE_LIBRARY_ARTICLE_BYTES - 5,
      );
      const c = (await pull(f.owner)).changes[0]!;
      expect(c.article).toMatchObject({ contentUnavailable: true, text: "" });
      expect(c.annotations).toEqual({
        complete: false,
        reason: "annotation_limit",
      });
      expect(Buffer.byteLength(JSON.stringify(c))).toBeLessThanOrEqual(
        NATIVE_LIBRARY_ARTICLE_BYTES,
      );
    });

    it("keeps article and child payloads on the same repeatable-read snapshot during concurrent web writes", async () => {
      const f = await fixture(),
        n = note(f.articleId, "1");
      await mutate(f.owner, n);
      const writer = (async () => {
        for (let i = 2; i <= 10; i++)
          await connection.begin(async (tx) => {
            await tx`UPDATE "read-it-later_article" SET title = ${`pair-${i}`} WHERE id = ${f.articleId}`;
            await tx`UPDATE "read-it-later_note" SET content = ${String(i)} WHERE id = ${n.noteId as string}`;
          });
      })();
      for (let i = 0; i < 10; i++) {
        const c = (await pull(f.owner)).changes[0]!;
        const value = complete(c.annotations).notes[0]?.content;
        expect(c.article?.title).toBe(
          value === "1" ? "Synthetic" : `pair-${value}`,
        );
      }
      await writer;
    });
  },
);

describe.skipIf(!url)(
  "annotation HTTP on the complete fresh migration chain",
  () => {
    const name = `native_annotation_fresh_${randomUUID().replaceAll("-", "")}`;
    let admin: postgres.Sql | undefined;
    let connection: postgres.Sql | undefined;
    let created = false;
    beforeAll(async () => {
      if (!url) throw new Error("Explicit local annotation test URL required");
      const parsed = new URL(url);
      if (
        !["postgres:", "postgresql:"].includes(parsed.protocol) ||
        !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
        parsed.search
      )
        throw new Error(
          "Fresh migration fixtures require an explicit local PostgreSQL URL without overrides",
        );
      admin = postgres(url, { max: 1, onnotice: () => undefined });
      // Only CREATE/DROP DATABASE run on the supplied connection. No queries or
      // migrations touch its public schema or the parent's fixture backend.
      await admin.unsafe(`CREATE DATABASE "${name}"`);
      created = true;
      parsed.pathname = `/${name}`;
      connection = postgres(parsed.href, { max: 4, onnotice: () => undefined });
      const store = drizzle(connection, { schema });
      await migrate(store, { migrationsFolder: "drizzle" });
      httpFixture.database = store;
    });
    afterAll(async () => {
      httpFixture.database = undefined;
      httpFixture.getSession.mockReset();
      await connection?.end();
      if (admin) {
        if (created) await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
        await admin.end();
      }
    });
    it("creates, exports, patches and deletes a highlight through real signed-Bearer route handlers", async () => {
      if (!connection) throw new Error("Missing fresh migration fixture");
      const auth = betterAuth({
        ...nativeAuthOptions(),
        emailAndPassword: { enabled: true },
        database: memoryAdapter({
          user: [],
          account: [],
          session: [],
          verification: [],
        }),
        baseURL: "https://example.com",
        secret: "synthetic-fresh-annotation-auth-secret-over-32-characters",
        rateLimit: { enabled: false },
      });
      const login = await auth.handler(
        new Request("https://example.com/api/auth/sign-up/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://example.com",
          },
          body: JSON.stringify({
            name: "Synthetic fresh annotation",
            email: "fresh-annotation@example.invalid",
            password: "synthetic-annotation-password-123",
          }),
        }),
      );
      expect(login.status).toBe(200);
      const identity = (await login.json()) as { user: { id: string } };
      const token = login.headers.get("set-auth-token");
      expect(token).toBeTruthy();
      httpFixture.getSession.mockImplementation(
        (input: Parameters<typeof auth.api.getSession>[0]) =>
          auth.api.getSession(input),
      );
      await connection`INSERT INTO "read-it-later_user" (id, name, email, "emailVerified") VALUES (${identity.user.id}, 'Synthetic fresh annotation', 'fresh-annotation@example.invalid', true)`;
      const { POST } = await import("~/app/api/native/library/mutations/route");
      const { GET } = await import("~/app/api/native/library/route");
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      const write = async (item: unknown) => {
        const response = await POST(
          new Request("https://example.com/api/native/library/mutations", {
            method: "POST",
            headers,
            body: JSON.stringify({ protocolVersion: 2, mutations: [item] }),
          }),
        );
        expect(response.status).toBe(200);
        return (await response.json()) as {
          results: {
            status: string;
            articleId: string;
            annotationId?: string;
          }[];
        };
      };
      const read = async (cursor?: string, protocolVersion = 2) => {
        const response = await GET(
          new Request(
            `https://example.com/api/native/library?protocolVersion=${protocolVersion}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
            { headers },
          ),
        );
        expect(response.status).toBe(200);
        return (await response.json()) as Awaited<
          ReturnType<typeof pullNativeLibrary>
        >;
      };
      expect(
        (
          await GET(
            new Request(
              "https://example.com/api/native/library?protocolVersion=2",
            ),
          )
        ).status,
      ).toBe(401);
      const articleId = randomUUID(),
        highlightId = randomUUID(),
        noteId = randomUUID();
      await write(
        mutation(articleId, "create", {
          url: "https://example.com/fresh-annotation",
          title: "Fresh schema",
          text: "First 😀é paragraph.\n\nSecond paragraph.",
          isRead: false,
          isFavorite: false,
        }),
      );
      const createHighlight = mutation(articleId, "highlight.create", {
        highlightId,
        color: "purple",
        sourceAnchor: source(),
      });
      expect((await write(createHighlight)).results[0]).toMatchObject({
        status: "applied",
        articleId,
        annotationId: highlightId,
      });
      await write(
        mutation(articleId, "note.create", {
          noteId,
          highlightId,
          content: "Attached fresh note",
        }),
      );
      const first = await read();
      const snapshot = complete(first.changes[0]?.annotations);
      expect(snapshot.highlights[0]).toMatchObject({
        id: highlightId,
        color: "purple",
        sourceAnchor: source(),
        canonicalAnchor: { text: "First", startOffset: 0, endOffset: 5 },
        resolution: "anchored",
      });
      expect(snapshot.notes[0]).toMatchObject({
        id: noteId,
        highlightId,
        content: "Attached fresh note",
      });
      const [stored] =
        await connection`SELECT version, "anchorContentHash", anchor_status, "sourceAnchor", "webAnchor" FROM "read-it-later_highlight" WHERE id = ${highlightId}`;
      expect(stored).toMatchObject({
        version: 1,
        anchorContentHash: source().contentHash,
        anchor_status: "anchored",
        sourceAnchor: source(),
        webAnchor: {
          text: "First",
          contentHash: hashAnchorText("First 😀é paragraph.Second paragraph."),
        },
      });
      expect((await read(undefined, 1)).changes[0]).not.toHaveProperty(
        "annotations",
      );
      await write(
        mutation(articleId, "highlight.update", {
          highlightId,
          patch: { color: "gray" },
        }),
      );
      expect(
        complete((await read(first.cursor)).changes[0]?.annotations)
          .highlights[0]?.color,
      ).toBe("gray");
      await write(mutation(articleId, "highlight.delete", { highlightId }));
      const gone = await read(first.cursor);
      expect(gone.changes[0]?.deleted).toBe(false);
      const deleted = complete(gone.changes[0]?.annotations);
      expect(deleted.highlights).toEqual([]);
      expect(deleted.notes).toEqual([]);
      expect(deleted.deleted).toEqual(
        expect.arrayContaining([
          { kind: "highlight", id: highlightId },
          { kind: "note", id: noteId },
        ]),
      );
      expect(
        (await write({ ...createHighlight, mutationId: randomUUID() }))
          .results[0],
      ).toMatchObject({
        status: "deleted",
        articleId,
        annotationId: highlightId,
      });
      const cascadeHighlight = randomUUID(),
        attached = randomUUID(),
        standalone = randomUUID();
      await write(
        mutation(articleId, "highlight.create", {
          highlightId: cascadeHighlight,
          color: "orange",
          sourceAnchor: source(),
        }),
      );
      await write(
        mutation(articleId, "note.create", {
          noteId: attached,
          highlightId: cascadeHighlight,
          content: "Cascade attached",
        }),
      );
      await write(
        mutation(articleId, "note.create", {
          noteId: standalone,
          content: "Cascade standalone",
        }),
      );
      await write(mutation(articleId, "delete", {}));
      const parentGone = await read(gone.cursor);
      expect(parentGone.changes).toMatchObject([
        { id: articleId, deleted: true, article: null },
      ]);
      expect(
        await connection`SELECT id FROM "read-it-later_highlight" WHERE "articleId" = ${articleId}`,
      ).toHaveLength(0);
      expect(
        await connection`SELECT id FROM "read-it-later_note" WHERE "articleId" = ${articleId}`,
      ).toHaveLength(0);
      const retained =
        await connection`SELECT id, deleted FROM "read-it-later_native_annotation" WHERE owner_id = ${identity.user.id} AND article_id = ${articleId}`;
      expect(retained).toEqual(
        expect.arrayContaining([
          { id: cascadeHighlight, deleted: true },
          { id: attached, deleted: true },
          { id: standalone, deleted: true },
        ]),
      );
      await migrate(drizzle(connection), { migrationsFolder: "drizzle" });
      expect((await read(parentGone.cursor)).changes).toEqual([]);
    }, 30_000);
  },
);
