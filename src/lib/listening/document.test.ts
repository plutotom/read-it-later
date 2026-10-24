import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import {
  createListeningDocument,
  segmentAtSourceOffset,
  sourceRange,
} from "./document";

function parse(html: string) {
  const dom = new JSDOM(html);
  const root = dom.window.document.body;
  return { dom, root, document: createListeningDocument(root) };
}
describe("listening document", () => {
  it("maps inline markup, whitespace, repeated words and Unicode to the original DOM", () => {
    const { root, document } = parse(
      "<p>  🌍 café <strong>café</strong>\n  again.</p><p>Next <em>paragraph</em>.</p>",
    );
    expect(document.segments.map((s) => s.text)).toEqual([
      "🌍 café café again.",
      "Next paragraph.",
    ]);
    const segment = document.segments[0]!;
    const range = sourceRange(segment, segment.text.lastIndexOf("café"), 4)!;
    expect(root.textContent.slice(range.start, range.end)).toBe("café");
    expect(range.start).toBe(root.textContent.lastIndexOf("café"));
    expect(segmentAtSourceOffset(document, range.start)).toBe(0);
  });
  it("creates matching revisions on the server body and nested browser reader", () => {
    const html =
      "<section><h2>Title</h2><p>Hello<br>world.</p><ul><li>One</li><li>Two</li></ul></section>";
    const server = parse(html);
    const browser = parse("<div id='reader'><div>" + html + "</div></div>");
    const document = createListeningDocument(
      browser.root.querySelector("#reader")!,
    );
    expect(document).toEqual(server.document);
    expect(document.segments.map((s) => s.text)).toEqual([
      "Title",
      "Hello world.",
      "One",
      "Two",
    ]);
  });
  it("skips hidden and executable content without shifting source offsets", () => {
    const { root, document } = parse(
      "<p>Read.</p><script>skip this</script><div hidden>Hidden</div><p>Finish.</p>",
    );
    expect(document.segments.map((s) => s.text)).toEqual(["Read.", "Finish."]);
    expect(document.paragraphs[1]!.start).toBe(
      root.textContent.indexOf("Finish."),
    );
  });
  it("bounds enormous paragraphs and tokens without losing text or splitting surrogates", () => {
    const text = "A sentence. ".repeat(300) + "🌍".repeat(1000);
    const { document } = parse("<p>" + text + "</p>");
    expect(document.paragraphs).toHaveLength(1);
    expect(
      document.segments.map((s) => s.text.replace(/\s/gu, "")).join(""),
    ).toBe(text.replace(/\s/gu, ""));
    for (const segment of document.segments) {
      expect(segment.text.length).toBeLessThanOrEqual(900);
      expect(segment.sourceOffsets).toHaveLength(segment.text.length);
      expect(() => encodeURIComponent(segment.text)).not.toThrow();
    }
  });
  it("starts at the paragraph beginning even when the selection is in a later segment", () => {
    const { document } = parse(
      "<p>First.</p><p> " + "A sentence. ".repeat(300) + "</p>",
    );
    expect(
      segmentAtSourceOffset(
        document,
        document.segments.at(-1)!.sourceOffsets[0]!,
      ),
    ).toBe(1);
    expect(segmentAtSourceOffset(document, 0)).toBe(0);
    expect(segmentAtSourceOffset(document, -1)).toBeUndefined();
    expect(parse("<p>Changed.</p>").document.revision).not.toBe(
      parse("<p>Original.</p>").document.revision,
    );
  });
});
