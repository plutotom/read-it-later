import { describe, expect, it } from "vitest";
import { manifestBookFromExport } from "~/server/services/paraExportService";
import type { paraExports } from "~/server/db/schema";

type ExportRow = typeof paraExports.$inferSelect;

function makeExportRow(overrides: Partial<ExportRow> = {}): ExportRow {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    userId: "user-1",
    articleId: "article-1",
    title: "Test Article",
    filename: "test-article.txt",
    txtContent: "body",
    bytes: 100,
    sha256: "a".repeat(64),
    contentHash: "b".repeat(64),
    gotoPage: null,
    gotoVersion: 0,
    gotoSetAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("manifestBookFromExport", () => {
  it("omits goto fields when gotoPage is unset", () => {
    const book = manifestBookFromExport(
      makeExportRow(),
      "https://read-it-later.com",
    );

    expect(book).toEqual({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "test-article.txt",
      url: "https://read-it-later.com/api/para/articles/550e8400-e29b-41d4-a716-446655440000",
      sha256: "a".repeat(64),
      bytes: 100,
    });
    expect(book.goto_page).toBeUndefined();
    expect(book.goto_version).toBeUndefined();
  });

  it("includes goto_page and goto_version when gotoPage is set", () => {
    const book = manifestBookFromExport(
      makeExportRow({ gotoPage: 42, gotoVersion: 3 }),
      "https://read-it-later.com/",
    );

    expect(book.goto_page).toBe(42);
    expect(book.goto_version).toBe(3);
  });

  it("omits goto fields when gotoPage is below 1", () => {
    const book = manifestBookFromExport(
      makeExportRow({ gotoPage: 0, gotoVersion: 1 }),
      "https://read-it-later.com",
    );

    expect(book.goto_page).toBeUndefined();
    expect(book.goto_version).toBeUndefined();
  });
});
