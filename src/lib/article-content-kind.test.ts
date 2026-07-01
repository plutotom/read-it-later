import { describe, expect, it } from "vitest";
import {
  getArticleContentKind,
  isPdfArticle,
} from "~/lib/article-content-kind";

describe("article-content-kind", () => {
  it("defaults to html when metadata is missing", () => {
    expect(getArticleContentKind(null)).toBe("html");
    expect(getArticleContentKind(undefined)).toBe("html");
    expect(isPdfArticle({})).toBe(false);
  });

  it("detects pdf articles from metadata", () => {
    expect(
      getArticleContentKind({
        contentKind: "pdf",
        siteName: "example.com",
      }),
    ).toBe("pdf");
    expect(
      isPdfArticle({
        metadata: { contentKind: "pdf" },
      }),
    ).toBe(true);
  });
});
