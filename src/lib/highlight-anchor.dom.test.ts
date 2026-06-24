// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildTextNodeIndex,
  getAnchorText,
  rangeFromOffsets,
  resolveHighlight,
  selectionToAnchor,
  hashAnchorText,
} from "./highlight-anchor";

function mount(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

/** Build a Selection spanning the given quote in the rendered text. */
function selectText(root: HTMLElement, quote: string): Selection {
  const index = buildTextNodeIndex(root);
  const full = getAnchorText(root);
  const start = full.indexOf(quote);
  if (start === -1) throw new Error(`"${quote}" not found in anchor text`);
  const end = start + quote.length;

  const startEntry = index.find((e) => start >= e.start && start <= e.end)!;
  const endEntry = index.find((e) => end >= e.start && end <= e.end)!;

  const range = document.createRange();
  range.setStart(startEntry.node, start - startEntry.start);
  range.setEnd(endEntry.node, end - endEntry.start);

  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("getAnchorText / buildTextNodeIndex", () => {
  it("concatenates text content across elements", () => {
    const root = mount("<p>Hello</p><p>World</p>");
    expect(getAnchorText(root)).toBe("HelloWorld");
    const index = buildTextNodeIndex(root);
    expect(index).toHaveLength(2);
    expect(index[0]!.start).toBe(0);
    expect(index[1]!.start).toBe(5);
  });
});

describe("selectionToAnchor (create path)", () => {
  it("produces offsets, quote and context from a selection", () => {
    const root = mount(
      "<p>The quick brown <strong>fox</strong> jumps over the lazy dog.</p>",
    );
    const selection = selectText(root, "brown fox");
    const anchor = selectionToAnchor(root, selection);

    expect(anchor).not.toBeNull();
    expect(anchor!.text).toBe("brown fox");
    const full = getAnchorText(root);
    expect(anchor!.startOffset).toBe(full.indexOf("brown fox"));
    expect(anchor!.endOffset).toBe(full.indexOf("brown fox") + 9);
    expect(anchor!.contextPrefix.endsWith("quick ")).toBe(true);
    expect(anchor!.contextSuffix.startsWith(" jumps")).toBe(true);
    expect(anchor!.anchorContentHash).toBe(hashAnchorText(full));
  });

  it("returns null for a collapsed selection", () => {
    const root = mount("<p>Hello world</p>");
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    expect(selectionToAnchor(root, selection)).toBeNull();
  });
});

describe("rangeFromOffsets", () => {
  it("round-trips offsets back to a Range over the same text", () => {
    const root = mount("<p>The quick brown fox jumps.</p>");
    const full = getAnchorText(root);
    const start = full.indexOf("brown");
    const end = start + "brown".length;
    const range = rangeFromOffsets(root, start, end);
    expect(range!.toString()).toBe("brown");
  });
});

describe("resolveHighlight (restore path)", () => {
  it("anchors via the fast path when content is unchanged", () => {
    const root = mount("<p>The quick brown fox jumps over the lazy dog.</p>");
    const selection = selectText(root, "brown fox");
    const anchor = selectionToAnchor(root, selection)!;

    const resolved = resolveHighlight(root, anchor);
    expect(resolved.status).toBe("anchored");
    if (resolved.status !== "anchored") throw new Error("expected anchored");
    expect(resolved.relocated).toBe(false);
    expect(resolved.range.toString()).toBe("brown fox");
  });

  it("relocates when content shifted (offsets stale, quote intact)", () => {
    const root = mount("<p>The quick brown fox jumps over the lazy dog.</p>");
    const selection = selectText(root, "brown fox");
    const anchor = selectionToAnchor(root, selection)!;

    // Simulate a re-extraction that prepended text: offsets + hash now stale.
    root.innerHTML =
      "<p>BREAKING: The quick brown fox jumps over the lazy dog.</p>";

    const resolved = resolveHighlight(root, anchor);
    expect(resolved.status).toBe("anchored");
    if (resolved.status !== "anchored") throw new Error("expected anchored");
    expect(resolved.relocated).toBe(true);
    expect(resolved.range.toString()).toBe("brown fox");
  });

  it("reports lost when the quote no longer exists", () => {
    const root = mount("<p>The quick brown fox jumps over the lazy dog.</p>");
    const selection = selectText(root, "brown fox");
    const anchor = selectionToAnchor(root, selection)!;

    root.innerHTML = "<p>Completely different content here.</p>";

    const resolved = resolveHighlight(root, anchor);
    expect(resolved.status).toBe("lost");
  });
});
