import { describe, expect, it } from "vitest";
import {
  cyrb53,
  extractContext,
  findQuoteOffsets,
  hashAnchorText,
  normalizeWhitespace,
} from "./highlight-anchor";

describe("hashAnchorText / cyrb53", () => {
  it("is stable for the same input", () => {
    expect(hashAnchorText("hello world")).toBe(hashAnchorText("hello world"));
  });

  it("differs for different input", () => {
    expect(hashAnchorText("hello world")).not.toBe(
      hashAnchorText("hello worl"),
    );
  });

  it("changes when a single character changes", () => {
    expect(cyrb53("the quick brown fox")).not.toBe(
      cyrb53("the quick brown fix"),
    );
  });
});

describe("normalizeWhitespace", () => {
  it("collapses runs of whitespace to single spaces", () => {
    expect(normalizeWhitespace("a   b\n\t c").normalized).toBe("a b c");
  });

  it("maps normalized indices back to raw indices", () => {
    const { normalized, map } = normalizeWhitespace("a   b");
    expect(normalized).toBe("a b");
    // 'a' -> raw 0, ' ' -> raw 1 (first space of the run), 'b' -> raw 4
    expect(map).toEqual([0, 1, 4]);
  });
});

describe("extractContext", () => {
  const text = "The quick brown fox jumps over the lazy dog";
  it("captures prefix and suffix around the range", () => {
    const start = text.indexOf("fox");
    const end = start + "fox".length;
    const { contextPrefix, contextSuffix } = extractContext(
      text,
      start,
      end,
      5,
    );
    expect(contextPrefix).toBe("rown ");
    expect(contextSuffix).toBe(" jump");
  });

  it("clamps at the boundaries", () => {
    const { contextPrefix } = extractContext(text, 0, 3, 10);
    expect(contextPrefix).toBe("");
  });
});

describe("findQuoteOffsets", () => {
  const text = "The quick brown fox jumps over the lazy dog.";

  it("finds a unique quote by exact match", () => {
    const found = findQuoteOffsets(text, {
      text: "brown fox",
      contextPrefix: "quick ",
      contextSuffix: " jumps",
    });
    expect(found).toEqual({
      start: text.indexOf("brown fox"),
      end: text.indexOf("brown fox") + "brown fox".length,
    });
  });

  it("disambiguates duplicate text using context", () => {
    const dup = "cat dog cat dog cat";
    // Target the second "cat", whose prefix is "dog " and suffix is " dog"
    const target = dup.indexOf("cat", 4);
    const found = findQuoteOffsets(dup, {
      text: "cat",
      contextPrefix: "dog ",
      contextSuffix: " dog",
    });
    expect(found).toEqual({ start: target, end: target + 3 });
  });

  it("relocates a quote when surrounding content shifted", () => {
    const shifted = "NEW INTRO. The quick brown fox jumps over the lazy dog.";
    const found = findQuoteOffsets(shifted, {
      text: "brown fox",
      contextPrefix: "quick ",
      contextSuffix: " jumps",
    });
    expect(found).toEqual({
      start: shifted.indexOf("brown fox"),
      end: shifted.indexOf("brown fox") + "brown fox".length,
    });
  });

  it("matches across whitespace changes via the normalized fallback", () => {
    // Stored quote had single spaces; current content collapsed differently.
    const reflowed = "The quick   brown\n\nfox jumps over the lazy dog.";
    const found = findQuoteOffsets(reflowed, {
      text: "brown fox",
      contextPrefix: "",
      contextSuffix: "",
    });
    expect(found).not.toBeNull();
    // Raw slice spans the reflowed whitespace.
    expect(reflowed.slice(found!.start, found!.end)).toBe("brown\n\nfox");
  });

  it("returns null when the quote is gone", () => {
    const found = findQuoteOffsets(text, {
      text: "purple elephant",
      contextPrefix: "",
      contextSuffix: "",
    });
    expect(found).toBeNull();
  });

  it("returns null for an empty quote", () => {
    expect(
      findQuoteOffsets(text, {
        text: "",
        contextPrefix: "",
        contextSuffix: "",
      }),
    ).toBeNull();
  });
});
