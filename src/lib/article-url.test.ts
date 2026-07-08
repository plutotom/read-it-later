import { describe, expect, it } from "vitest";
import { getDomainFromUrl, normalizeArticleUrl } from "~/lib/article-url";

describe("getDomainFromUrl", () => {
  it("returns the hostname without a www prefix", () => {
    expect(getDomainFromUrl("https://www.example.com/article")).toBe(
      "example.com",
    );
  });

  it("falls back to the input for invalid URLs", () => {
    expect(getDomainFromUrl("not a url")).toBe("not a url");
  });
});

describe("normalizeArticleUrl", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeArticleUrl(" https://example.com/article ")).toBe(
      "https://example.com/article",
    );
  });

  it("keeps a normal PDF URL unchanged", () => {
    expect(normalizeArticleUrl("https://example.com/report.pdf")).toBe(
      "https://example.com/report.pdf",
    );
  });

  it("removes an accidentally concatenated duplicate PDF URL", () => {
    expect(
      normalizeArticleUrl(
        "https://www.datocms-assets.com/160835/1768963143-ai-in-society.pdfhttps://www.datocms-assets.com/160835/1768963143-ai-in-society.pdf",
      ),
    ).toBe(
      "https://www.datocms-assets.com/160835/1768963143-ai-in-society.pdf",
    );
  });

  it("uses the first PDF URL when two absolute PDF URLs are concatenated", () => {
    expect(
      normalizeArticleUrl(
        "https://example.com/one.pdfhttps://example.com/two.pdf",
      ),
    ).toBe("https://example.com/one.pdf");
  });

  it("does not rewrite non-PDF URLs with an embedded protocol string", () => {
    expect(
      normalizeArticleUrl(
        "https://example.com/articlehttps://tracker.example.com/path",
      ),
    ).toBe("https://example.com/articlehttps://tracker.example.com/path");
  });
});
