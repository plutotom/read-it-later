import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import type { db as Db } from "~/server/db";
import { highlights, notes } from "~/server/db/schema";
import {
  createHighlight,
  updateHighlight,
  createNote,
  updateNote,
  type CreateHighlightInput,
} from "./annotationService";

type Row = Record<string, unknown>;

// Synthetic relational fixture: evaluate the actual parameterized equality
// predicates so omitting an owner/article filter makes authorization tests fail.
function fixture() {
  const rows: Record<string, Row[]> = {
    "read-it-later_article": [
      { id: "article-a", userId: "alice" },
      { id: "article-a2", userId: "alice" },
      { id: "article-b", userId: "bob" },
    ],
    "read-it-later_highlight": [
      { id: "highlight-a", userId: "alice", articleId: "article-a" },
      { id: "highlight-a2", userId: "alice", articleId: "article-a" },
      {
        id: "highlight-other-article",
        userId: "alice",
        articleId: "article-a2",
      },
      { id: "highlight-b", userId: "bob", articleId: "article-b" },
      // A legacy malformed highlight must not be usable in a new relationship.
      { id: "highlight-legacy", userId: "bob", articleId: "article-a" },
    ],
    "read-it-later_note": [
      {
        id: "note-a",
        userId: "alice",
        articleId: "article-a",
        highlightId: "highlight-a",
        content: "Synthetic note",
      },
      {
        id: "note-b",
        userId: "bob",
        articleId: "article-b",
        highlightId: null,
        content: "Other synthetic note",
      },
      {
        id: "note-legacy-article",
        userId: "alice",
        articleId: "article-b",
        highlightId: null,
        content: "Legacy fixture",
      },
      {
        id: "note-legacy-highlight",
        userId: "alice",
        articleId: "article-a",
        highlightId: "highlight-legacy",
        content: "Legacy fixture",
      },
    ],
  };
  const dialect = new PgDialect();
  const matches = (row: Row, where: SQL) => {
    const compiled = dialect.sqlToQuery(where);
    const predicates = [
      ...compiled.sql.matchAll(/"[^"]+"\."([^"]+)" = \$(\d+)/g),
    ];
    if (!predicates.length) throw new Error("Missing fixture predicates");
    return predicates.every(
      ([, column, index]) =>
        row[column!] === compiled.params[Number(index) - 1],
    );
  };
  const findFirst = (table: string) =>
    vi.fn(async ({ where }: { where: SQL }) =>
      rows[table]!.find((row) => matches(row, where)),
    );
  const insert = vi.fn((table: PgTable) => ({
    values: (values: Row) => ({
      returning: async () => {
        const created = { id: "synthetic-created", ...values };
        rows[getTableName(table)]!.push(created);
        return [created];
      },
    }),
  }));
  const writes: Row[] = [];
  const update = vi.fn((table: PgTable) => ({
    set: (values: Row) => {
      writes.push(values);
      return {
        where: (where: SQL) => ({
          returning: async () => {
            const row = rows[getTableName(table)]!.find((candidate) =>
              matches(candidate, where),
            );
            if (!row) return [];
            Object.assign(row, values);
            return [row];
          },
        }),
      };
    },
  }));
  const mock = {
    query: {
      articles: { findFirst: findFirst("read-it-later_article") },
      highlights: { findFirst: findFirst("read-it-later_highlight") },
      notes: { findFirst: findFirst("read-it-later_note") },
    },
    insert,
    update,
  };
  return { db: mock as unknown as typeof Db, mock, rows, writes };
}

const highlightInput: CreateHighlightInput = {
  articleId: "article-a",
  text: "Synthetic selection",
  startOffset: 0,
  endOffset: 19,
  contextPrefix: "",
  contextSuffix: "",
};

describe("annotation parent authorization", () => {
  it.each(["article-b", "missing-article"])(
    "rejects highlight creation for %s before writing",
    async (articleId) => {
      const { db, mock } = fixture();
      await expect(
        createHighlight(db, "alice", { ...highlightInput, articleId }),
      ).rejects.toThrow("Article not found");
      expect(mock.insert).not.toHaveBeenCalled();
    },
  );

  it("creates a highlight on the caller's article with existing defaults", async () => {
    const { db, mock } = fixture();
    await expect(
      createHighlight(db, "alice", highlightInput),
    ).resolves.toMatchObject({
      ...highlightInput,
      userId: "alice",
      color: "yellow",
      version: 1,
      tags: [],
    });
    expect(mock.insert).toHaveBeenCalledWith(highlights);
  });

  it.each(["article-b", "missing-article"])(
    "rejects note creation for %s before writing",
    async (articleId) => {
      const { db, mock } = fixture();
      await expect(
        createNote(db, "alice", { articleId, content: "Synthetic" }),
      ).rejects.toThrow("Article not found");
      expect(mock.insert).not.toHaveBeenCalled();
    },
  );

  it.each([
    "highlight-b",
    "highlight-other-article",
    "highlight-legacy",
    "missing-highlight",
  ])("rejects note creation with %s", async (highlightId) => {
    const { db, mock } = fixture();
    await expect(
      createNote(db, "alice", {
        articleId: "article-a",
        highlightId,
        content: "Synthetic",
      }),
    ).rejects.toThrow("Highlight not found for article");
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "highlight-a"])(
    "creates a note with valid highlight %s",
    async (highlightId) => {
      const { db, mock } = fixture();
      await expect(
        createNote(db, "alice", {
          articleId: "article-a",
          highlightId,
          content: "Synthetic",
        }),
      ).resolves.toMatchObject({
        articleId: "article-a",
        highlightId: highlightId ?? null,
        userId: "alice",
      });
      expect(mock.insert).toHaveBeenCalledWith(notes);
    },
  );

  it.each([
    "highlight-b",
    "highlight-other-article",
    "highlight-legacy",
    "missing-highlight",
  ])(
    "rejects reassignment to %s without applying any patch",
    async (highlightId) => {
      const { db, mock, rows } = fixture();
      await expect(
        updateNote(db, "alice", "note-a", { highlightId, content: "Changed" }),
      ).rejects.toThrow("Highlight not found for article");
      expect(mock.update).not.toHaveBeenCalled();
      expect(rows["read-it-later_note"]![0]!.content).toBe("Synthetic note");
    },
  );

  it.each(["note-b", "missing-note"])(
    "does not update an unowned/missing note %s",
    async (id) => {
      const { db, mock } = fixture();
      await expect(
        updateNote(db, "alice", id, { highlightId: "highlight-a" }),
      ).resolves.toBeUndefined();
      expect(mock.update).not.toHaveBeenCalled();
      expect(mock.query.highlights.findFirst).not.toHaveBeenCalled();
      expect(mock.query.articles.findFirst).not.toHaveBeenCalled();
    },
  );

  it.each(["highlight-a2", null])(
    "allows valid note reassignment/detachment to %s",
    async (highlightId) => {
      const { db } = fixture();
      await expect(
        updateNote(db, "alice", "note-a", {
          highlightId,
          content: "Changed",
          position: { x: 1, y: 2 },
        }),
      ).resolves.toMatchObject({
        highlightId,
        content: "Changed",
        position: { x: 1, y: 2 },
        userId: "alice",
        articleId: "article-a",
      });
    },
  );

  it("keeps the attachment when highlightId is omitted", async () => {
    const { db } = fixture();
    await expect(
      updateNote(db, "alice", "note-a", { content: "Changed" }),
    ).resolves.toMatchObject({
      highlightId: "highlight-a",
      content: "Changed",
    });
  });

  it.each(["note-legacy-article", "note-legacy-highlight"])(
    "does not write through an invalid legacy relationship: %s",
    async (id) => {
      const { db, mock } = fixture();
      await expect(
        updateNote(db, "alice", id, { content: "Changed" }),
      ).rejects.toThrow();
      expect(mock.update).not.toHaveBeenCalled();
    },
  );

  it("can repair a legacy highlight attachment by detaching it", async () => {
    const { db } = fixture();
    await expect(
      updateNote(db, "alice", "note-legacy-highlight", { highlightId: null }),
    ).resolves.toMatchObject({ highlightId: null });
  });

  it("preserves the empty-patch lookup behavior and owner scope", async () => {
    const { db, mock } = fixture();
    await expect(updateNote(db, "alice", "note-a", {})).resolves.toMatchObject({
      id: "note-a",
    });
    await expect(
      updateNote(db, "alice", "note-b", {}),
    ).resolves.toBeUndefined();
    expect(mock.update).not.toHaveBeenCalled();
  });
});

describe("web highlight original source preservation", () => {
  it("captures the exact creation selector independently of mutable web offsets", async () => {
    const { db } = fixture();
    const input = { ...highlightInput, anchorContentHash: "123456789abcde" };
    const created = await createHighlight(db, "alice", input);
    expect(created.anchorSpace).toBe("web-dom-v1");
    expect(created.sourceAnchor).toEqual({
      space: "web-dom-v1",
      text: input.text,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      contextPrefix: input.contextPrefix,
      contextSuffix: input.contextSuffix,
      contentHash: input.anchorContentHash,
    });
  });
  it("captures pre-relocation columns in one owner-scoped SQL assignment", async () => {
    const { db, mock, rows, writes } = fixture();
    Object.assign(rows["read-it-later_highlight"]![0]!, {
      text: "a   b",
      startOffset: 0,
      endOffset: 5,
      anchorContentHash: "123456789abcde",
      sourceAnchor: null,
      anchorSpace: "web-dom-v1",
    });
    const updated = await updateHighlight(db, "alice", "highlight-a", {
      startOffset: 2,
      endOffset: 5,
      anchorContentHash: "fedcba98765432",
    });
    expect(updated).toMatchObject({
      text: "a   b",
      startOffset: 2,
      endOffset: 5,
    });
    expect(mock.query.highlights.findFirst).not.toHaveBeenCalled();
    const capture = new PgDialect().sqlToQuery(writes[0]!.sourceAnchor as SQL);
    expect(capture.sql).toContain(
      'COALESCE("read-it-later_highlight"."sourceAnchor", CASE',
    );
    for (const field of [
      "anchorSpace",
      "text",
      "startOffset",
      "endOffset",
      "contextPrefix",
      "contextSuffix",
      "anchorContentHash",
    ])
      expect(capture.sql).toContain(`"read-it-later_highlight"."${field}"`);
    expect(capture.params).toEqual([]);
    await expect(
      updateHighlight(db, "bob", "highlight-a", { startOffset: 99 }),
    ).resolves.toBeUndefined();
  });
  it("keeps original source and positions out of color/tag-only assignments", async () => {
    const { db, rows, writes } = fixture();
    const original = {
      space: "local-text-v1",
      text: "Saved quote",
      startOffset: 4,
      endOffset: 15,
      contentHash: "a".repeat(64),
      contextPrefix: "",
      contextSuffix: "",
    };
    Object.assign(rows["read-it-later_highlight"]![0]!, {
      sourceAnchor: original,
      anchorSpace: "local-text-v1",
      startOffset: 4,
      endOffset: 15,
    });
    const changed = await updateHighlight(db, "alice", "highlight-a", {
      color: "blue",
      tags: ["retained-source"],
    });
    expect(changed?.sourceAnchor).toBe(original);
    expect(writes[0]).toEqual({ color: "blue", tags: ["retained-source"] });
    expect(changed).toMatchObject({ startOffset: 4, endOffset: 15 });
  });
});
