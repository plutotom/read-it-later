import { describe, expect, it } from "vitest";
import {
  normalizeManualArticleContent,
  preprocessFlattenedMarkdown,
} from "~/server/services/articleContentNormalizer";

const FLATTENED_SAMPLE = `Men today often feel overwhelmed by the question of how to become the spiritual leader in their home. Many want to leave a spiritual legacy in their marriage and in their children's lives, but they do not know where to start. A helpful framework comes from Jefferson Bethke's reflection on the Amish and the three books traditionally found in their homes: the Bible, a hymnbook, and a book of martyrs. These three items point to three core themes every home needs to form faith in the next generation: * Scripture — the story of the home * Song — the soundtrack of the home * Story — the heroes of the home ### Scripture: The story of the home Every father is called to love the Word and share Jesus with his family. If you want your children to love the Bible, you must first be passionate about it yourself. ### Song: The soundtrack of the home A home should be a place of worship. ### Story: The heroes of the home Every family needs heroes worth admiring.`;

describe("preprocessFlattenedMarkdown", () => {
  it("splits inline bullets and headings onto separate lines", () => {
    const result = preprocessFlattenedMarkdown(FLATTENED_SAMPLE);
    expect(result).toContain("* Scripture — the story of the home\n* Song");
    expect(result).toContain("* Song — the soundtrack of the home\n* Story");
    expect(result).toContain(
      "### Scripture: The story of the home\n\nEvery father",
    );
  });
});

describe("normalizeManualArticleContent", () => {
  it("passes through existing HTML", () => {
    const html = "<p>Hello</p><h2>Title</h2>";
    expect(normalizeManualArticleContent(html)).toBe(html);
  });

  it("converts flattened Raycast-style markdown into structured HTML", () => {
    const result = normalizeManualArticleContent(FLATTENED_SAMPLE);
    expect(result).toContain("<h3>Scripture: The story of the home</h3>");
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>Scripture — the story of the home</li>");
    expect(result).toContain("<li>Song — the soundtrack of the home</li>");
    expect(result).toContain("<p>Every father is called");
    expect(result).not.toContain("### ");
    expect(result).not.toContain("* Scripture");
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

  it("splits single-newline plain text into separate paragraphs", () => {
    const text =
      "First paragraph of the article.\nSecond paragraph follows.\nThird paragraph wraps it up.";
    expect(normalizeManualArticleContent(text)).toBe(
      "<p>First paragraph of the article.</p>\n" +
        "<p>Second paragraph follows.</p>\n" +
        "<p>Third paragraph wraps it up.</p>",
    );
  });

  it("keeps single newlines as <br> when blank lines separate paragraphs", () => {
    const text = "Line one.\nLine two.\n\nSecond paragraph.";
    expect(normalizeManualArticleContent(text)).toBe(
      "<p>Line one.<br>Line two.</p>\n<p>Second paragraph.</p>",
    );
  });
});
