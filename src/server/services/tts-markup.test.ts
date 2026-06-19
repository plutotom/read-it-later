import { describe, expect, it } from "vitest";
import { chunkText } from "~/server/services/tts";
import {
  htmlToChirpMarkup,
  normalizeMarkupWhitespace,
  usesMarkupInput,
} from "~/server/services/tts-markup";

describe("htmlToChirpMarkup", () => {
  it("adds long pause after paragraphs", () => {
    const html = "<p>First paragraph.</p><p>Second paragraph.</p>";
    const markup = htmlToChirpMarkup(html);
    expect(markup).toContain("First paragraph.");
    expect(markup).toContain("[pause long]");
    expect(markup.match(/\[pause long\]/g)?.length).toBe(2);
  });

  it("adds long pause after blockquote", () => {
    const markup = htmlToChirpMarkup("<blockquote>A quote.</blockquote>");
    expect(markup).toContain("A quote.");
    expect(markup).toContain("[pause long]");
  });

  it("adds short pause after headings and list items", () => {
    const markup = htmlToChirpMarkup(
      "<h2>Title</h2><ul><li>One</li><li>Two</li></ul>",
    );
    expect(markup).toContain("Title");
    expect(markup).toContain("One");
    expect(markup).toContain("[pause]");
    expect(markup).not.toMatch(/\[pause long\].*\[pause\]/);
  });

  it("adds short pause for br", () => {
    const markup = htmlToChirpMarkup("<p>Line one<br>Line two</p>");
    expect(markup).toContain("[pause]");
    expect(markup).toContain("Line one");
    expect(markup).toContain("Line two");
  });

  it("removes script and style content", () => {
    const markup = htmlToChirpMarkup(
      '<p>Visible</p><script>alert("x")</script><style>.x{}</style><noscript>no</noscript>',
    );
    expect(markup).toContain("Visible");
    expect(markup).not.toContain("alert");
    expect(markup).not.toContain(".x");
    expect(markup).not.toContain("noscript");
  });

  it("does not add pause after bare div wrappers", () => {
    const markup = htmlToChirpMarkup("<div><p>Inside div</p></div>");
    expect(markup).toContain("Inside div");
    expect(markup.match(/\[pause long\]/g)?.length).toBe(1);
  });

  it("adds a sentence-ending period when a heading lacks punctuation", () => {
    const markup = htmlToChirpMarkup("<h2>A Heading With No Period</h2>");
    expect(markup).toMatch(/A Heading With No Period\.\s*\[pause\]/);
  });

  it("does not double up punctuation when text already ends with a period", () => {
    const markup = htmlToChirpMarkup("<p>Already done.</p>");
    expect(markup).not.toContain("..");
    expect(markup).toMatch(/Already done\.\s*\[pause long\]/);
  });

  it("collapses consecutive pauses from empty elements", () => {
    const markup = htmlToChirpMarkup("<p>Text.</p><p></p><p></p><p>More.</p>");
    expect(markup).not.toMatch(/\[pause long\]\s*\[pause long\]/);
  });

  it("preserves character count through chunkText round-trip", () => {
    const html = `<article>${"<p>Paragraph with some text. </p>".repeat(50)}</article>`;
    const markup = htmlToChirpMarkup(html);
    const chunks = chunkText(markup, 4000);
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    expect(total).toBe(markup.length);
  });
});

describe("normalizeMarkupWhitespace", () => {
  it("collapses spaces without removing pause tokens", () => {
    const result = normalizeMarkupWhitespace("Hello   world [pause]  more");
    expect(result).toBe("Hello world [pause] more");
  });
});

describe("usesMarkupInput", () => {
  it("returns true for Chirp 3 voices only", () => {
    expect(usesMarkupInput("en-US-Chirp3-HD-Charon")).toBe(true);
    expect(usesMarkupInput("en-US-Neural2-C")).toBe(false);
  });
});
