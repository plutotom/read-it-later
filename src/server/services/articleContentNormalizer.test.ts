import { describe, expect, it } from "vitest";
import { normalizeManualArticleContent } from "~/server/services/articleContentNormalizer";

describe("normalizeManualArticleContent", () => {
  it("passes through existing HTML", () => {
    const html = "<p>Hello</p><h2>Title</h2>";
    expect(normalizeManualArticleContent(html)).toBe(html);
  });

  it("converts markdown headings and bullets to HTML", () => {
    const markdown = `Intro paragraph.

### Scripture: The story of the home

Every father is called to love the Word.

* Scripture — the story of the home
* Song — the soundtrack of the home`;

    const result = normalizeManualArticleContent(markdown);
    expect(result).toContain("<h3>Scripture: The story of the home</h3>");
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>Scripture — the story of the home</li>");
  });

  it("wraps plain text paragraphs in <p> tags", () => {
    const text = "First paragraph.\n\nSecond paragraph.";
    expect(normalizeManualArticleContent(text)).toBe(
      "<p>First paragraph.</p>\n<p>Second paragraph.</p>",
    );
  });
});
