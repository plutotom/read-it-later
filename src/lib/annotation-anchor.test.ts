import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { createNativeLibraryDocument } from "./native-library-document";
import { hashAnchorText } from "./highlight-anchor";
import { projectAnnotationAnchor } from "./annotation-anchor";
import { sourceAnchorSchema, type SourceAnchor } from "./native-annotations";

function fixture(html: string) {
  const dom = new JSDOM(`<body>${html}</body>`);
  const root = dom.window.document.body;
  const document = createNativeLibraryDocument(root);
  const domText = root.textContent ?? "";
  dom.window.close();
  return { document, domText };
}
function source(
  text: string,
  hash: string,
  startOffset = 0,
  space: SourceAnchor["space"] = "paper-drive-text-v1",
): SourceAnchor {
  return {
    space,
    text,
    startOffset,
    endOffset: startOffset + text.length,
    contextPrefix: "",
    contextSuffix: "",
    contentHash: hash,
  };
}

describe("strict annotation source selectors", () => {
  it("accepts emoji/combining text in UTF-16 and rejects invalid selectors", () => {
    const valid = source("😀é", "a".repeat(64), 5);
    expect(sourceAnchorSchema.parse(valid)).toEqual(valid);
    for (const patch of [
      { endOffset: 8 },
      { startOffset: -1 },
      { endOffset: 1.2 },
      { contentHash: "short" },
      { space: "unknown" },
      { text: "\uD800" },
      { text: "a\0b" },
      { extra: true },
    ])
      expect(sourceAnchorSchema.safeParse({ ...valid, ...patch }).success).toBe(
        false,
      );
  });
});
describe("conservative annotation projections", () => {
  it("round-trips exact native and web UTF-16 ranges preserving original source", () => {
    const f = fixture("<p>Before 😀é after</p>");
    const native = source("😀é", f.document.contentHash, 7);
    const before = structuredClone(native);
    const projection = projectAnnotationAnchor(native, f.document, f.domText);
    expect(projection).toMatchObject({
      resolution: "anchored",
      canonicalAnchor: {
        text: native.text,
        startOffset: 7,
        endOffset: 11,
        contentHash: native.contentHash,
      },
    });
    expect(projection.webAnchor).toEqual({
      text: "😀é",
      startOffset: 7,
      endOffset: 11,
      contentHash: hashAnchorText(f.domText),
      contextPrefix: "Before ",
      contextSuffix: " after",
    });
    expect(native).toEqual(before);
    const web = source("😀é", hashAnchorText(f.domText), 7, "web-dom-v1");
    expect(
      projectAnnotationAnchor(web, f.document, f.domText).canonicalAnchor,
    ).toEqual({
      text: native.text,
      startOffset: 7,
      endOffset: 11,
      contentHash: native.contentHash,
    });
  });
  it("keeps mismatched native/local hashes unresolved even with a unique quote", () => {
    const f = fixture("<p>A unique quote</p>");
    for (const space of ["paper-drive-text-v1", "local-text-v1"] as const)
      expect(
        projectAnnotationAnchor(
          source("unique", "0".repeat(64), 2, space),
          f.document,
          f.domText,
        ),
      ).toEqual({
        resolution: "unresolved",
        canonicalAnchor: null,
        webAnchor: null,
      });
  });
  it("does not pick the first ambiguous legacy occurrence, even with repeated full context", () => {
    const f = fixture("<p>x quote y x quote y</p>");
    const ambiguous = {
      ...source("quote", "", 99, "web-dom-v1"),
      contextPrefix: "x ",
      contextSuffix: " y",
    };
    expect(
      projectAnnotationAnchor(ambiguous, f.document, f.domText).canonicalAnchor,
    ).toBeNull();
    expect(
      projectAnnotationAnchor(ambiguous, f.document, f.domText).webAnchor,
    ).toBeNull();
    const unique = { ...ambiguous, contextPrefix: "y x " };
    expect(
      projectAnnotationAnchor(unique, f.document, f.domText).canonicalAnchor
        ?.startOffset,
    ).toBe(12);
  });
  it.each([
    ["<p>a  b</p>", "a b"],
    ["<p>a<br>b</p>", "a b"],
    ["<p>a<span hidden>x</span>b</p>", "ab"],
    ["<p>a<script>x</script>b</p>", "ab"],
    ["<p>a</p><p>b</p>", "a\n\nb"],
  ])(
    "never guesses a DOM enclosing range across omitted/synthetic content (%s)",
    (html, quote) => {
      const f = fixture(html);
      expect(f.document.text).toBe(quote);
      const projected = projectAnnotationAnchor(
        source(quote, f.document.contentHash),
        f.document,
        f.domText,
      );
      expect(projected.canonicalAnchor?.text).toBe(quote);
      expect(projected.webAnchor).toBeNull();
      const web = source(f.domText, hashAnchorText(f.domText), 0, "web-dom-v1");
      expect(
        projectAnnotationAnchor(web, f.document, f.domText).canonicalAnchor,
      ).toBeNull();
    },
  );
  it("rejects duplicate mappings even when a selected character happens to match", () => {
    const f = fixture("<p>a<br>b</p>");
    expect(
      projectAnnotationAnchor(
        source("a", f.document.contentHash),
        f.document,
        f.domText,
      ).webAnchor,
    ).toBeNull();
  });
  it("rejects boundaries inside surrogate pairs", () => {
    const f = fixture("<p>😀</p>");
    expect(
      projectAnnotationAnchor(
        source("\uDE00", f.document.contentHash, 1),
        f.document,
        f.domText,
      ).resolution,
    ).toBe("unresolved");
  });
});
