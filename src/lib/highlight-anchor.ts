/**
 * Highlight anchoring — the shared contract between creating a highlight (from a
 * DOM selection) and restoring one (from stored offsets/quote). Both paths go
 * through this module so they can never disagree.
 *
 * The model follows the W3C Web Annotation pattern:
 *   - TextPosition selector: `startOffset`/`endOffset` into the article's
 *     `textContent` (the fast path).
 *   - TextQuote selector: the exact `text` plus surrounding `contextPrefix`/
 *     `contextSuffix` (the resilient fallback when offsets drift).
 *
 * Offsets index into `root.textContent` (NOT `Selection.toString()`), so that
 * the same character space is used when creating and when restoring. The stored
 * `text` is therefore `textContent.slice(start, end)`, which can differ from the
 * user's visible selection across block boundaries — that's intentional and
 * keeps the two directions consistent.
 *
 * The functions split into two groups:
 *   - Pure string functions (no DOM) — the algorithmic core, unit-testable in a
 *     plain Node environment.
 *   - DOM glue — thin wrappers that read the live DOM (Selection, Range,
 *     TreeWalker). Tested under jsdom.
 */

/** Bump when the anchoring algorithm changes in a way that affects stored data. */
export const HIGHLIGHT_ANCHOR_VERSION = 1;

/** How many characters of surrounding context to capture on each side. */
export const CONTEXT_LENGTH = 32;

export type QuoteSelector = {
  text: string;
  contextPrefix: string;
  contextSuffix: string;
};

export type HighlightAnchor = QuoteSelector & {
  startOffset: number;
  endOffset: number;
  version: number;
  anchorContentHash: string;
};

// ---------------------------------------------------------------------------
// Pure string functions (no DOM)
// ---------------------------------------------------------------------------

/**
 * cyrb53 — a fast, well-distributed non-cryptographic string hash. We only need
 * a cheap, stable fingerprint of the article text to detect whether the content
 * an offset was measured against still matches; cryptographic strength isn't
 * required and `crypto.subtle` is async, so this is a better fit.
 */
export function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hashed = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hashed.toString(16).padStart(14, "0");
}

/** Stable fingerprint of the article's anchor text. */
export function hashAnchorText(text: string): string {
  return cyrb53(text);
}

/**
 * Collapse runs of whitespace to a single space, returning the normalized
 * string plus a map from each normalized-character index back to the raw index
 * it came from. Used only by the fuzzy re-anchoring fallback, so that a match
 * found in normalized space can be translated back to raw offsets.
 */
export function normalizeWhitespace(text: string): {
  normalized: string;
  map: number[];
} {
  let normalized = "";
  const map: number[] = [];
  let prevWasSpace = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (/\s/u.test(char)) {
      if (!prevWasSpace) {
        normalized += " ";
        map.push(i);
        prevWasSpace = true;
      }
    } else {
      normalized += char;
      map.push(i);
      prevWasSpace = false;
    }
  }
  return { normalized, map };
}

/** Capture up to `len` characters of context on each side of [start, end). */
export function extractContext(
  fullText: string,
  start: number,
  end: number,
  len = CONTEXT_LENGTH,
): { contextPrefix: string; contextSuffix: string } {
  return {
    contextPrefix: fullText.slice(Math.max(0, start - len), start),
    contextSuffix: fullText.slice(end, end + len),
  };
}

/** Score how well `context` matches `text` ending at `before` (reading backwards). */
function suffixMatchLength(before: string, context: string): number {
  let n = 0;
  while (
    n < before.length &&
    n < context.length &&
    before[before.length - 1 - n] === context[n]
  ) {
    n++;
  }
  return n;
}

/** Score how well `context` matches `text` starting at `after` (reading forwards). */
function prefixMatchLength(after: string, context: string): number {
  let n = 0;
  while (n < after.length && n < context.length && after[n] === context[n]) {
    n++;
  }
  return n;
}

function allIndexesOf(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const out: number[] = [];
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    out.push(idx);
    from = idx + 1;
  }
  return out;
}

/**
 * Locate a quote within `fullText`, returning raw character offsets, or null if
 * it can't be found. Tries, in order:
 *   1. exact `prefix + text + suffix` (handles unchanged content + duplicates),
 *   2. exact `text`, disambiguated by context when there are several matches,
 *   3. whitespace-normalized `text`, mapped back to raw offsets (handles
 *      re-extracted content whose whitespace changed).
 */
export function findQuoteOffsets(
  fullText: string,
  quote: QuoteSelector,
): { start: number; end: number } | null {
  const { text, contextPrefix, contextSuffix } = quote;
  if (!text) return null;

  // 1. Exact match including surrounding context.
  if (contextPrefix || contextSuffix) {
    const withContext = contextPrefix + text + contextSuffix;
    const idx = fullText.indexOf(withContext);
    if (idx !== -1) {
      const start = idx + contextPrefix.length;
      return { start, end: start + text.length };
    }
  }

  // 2. Exact match of the text, using context to choose among duplicates.
  const occurrences = allIndexesOf(fullText, text);
  if (occurrences.length === 1) {
    const start = occurrences[0]!;
    return { start, end: start + text.length };
  }
  if (occurrences.length > 1) {
    let best = occurrences[0]!;
    let bestScore = -1;
    for (const start of occurrences) {
      const before = fullText.slice(0, start);
      const after = fullText.slice(start + text.length);
      const score =
        suffixMatchLength(before, contextPrefix) +
        prefixMatchLength(after, contextSuffix);
      if (score > bestScore) {
        bestScore = score;
        best = start;
      }
    }
    return { start: best, end: best + text.length };
  }

  // 3. Whitespace-normalized fallback, mapped back to raw offsets.
  const { normalized, map } = normalizeWhitespace(fullText);
  const normText = normalizeWhitespace(text).normalized;
  if (normText) {
    const nIdx = normalized.indexOf(normText);
    if (nIdx !== -1) {
      const rawStart = map[nIdx];
      // End maps from the last matched normalized char back to its raw index,
      // then +1 to become an exclusive end offset.
      const lastNorm = nIdx + normText.length - 1;
      const rawLast = map[lastNorm];
      if (rawStart !== undefined && rawLast !== undefined) {
        return { start: rawStart, end: rawLast + 1 };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// DOM glue
// ---------------------------------------------------------------------------

/** The article's anchor text — the character space all offsets index into. */
export function getAnchorText(root: Node): string {
  return root.textContent ?? "";
}

type TextNodeEntry = { node: Text; start: number; end: number };

/** Ordered map of every text node under `root` to its [start, end) char range. */
export function buildTextNodeIndex(root: Node): TextNodeEntry[] {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const entries: TextNodeEntry[] = [];
  let offset = 0;
  let node = walker.nextNode();
  while (node) {
    const len = node.textContent?.length ?? 0;
    entries.push({ node: node as Text, start: offset, end: offset + len });
    offset += len;
    node = walker.nextNode();
  }
  return entries;
}

/** Map a character offset to a DOM (textNode, offset) point. */
function offsetToPoint(
  index: TextNodeEntry[],
  offset: number,
): { node: Text; offset: number } | null {
  for (const entry of index) {
    if (offset >= entry.start && offset <= entry.end) {
      return { node: entry.node, offset: offset - entry.start };
    }
  }
  return null;
}

/** Build a DOM Range spanning [start, end) of the anchor text, or null. */
export function rangeFromOffsets(
  root: Node,
  start: number,
  end: number,
  index = buildTextNodeIndex(root),
): Range | null {
  const startPoint = offsetToPoint(index, start);
  const endPoint = offsetToPoint(index, end);
  if (!startPoint || !endPoint) return null;
  const doc = root.ownerDocument ?? (root as Document);
  const range = doc.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  return range;
}

/** Convert a DOM boundary point (node, offsetInNode) to an anchor-text offset. */
function pointToOffset(
  index: TextNodeEntry[],
  node: Node,
  offsetInNode: number,
): number | null {
  // Fast path: the boundary is inside a text node we indexed.
  if (node.nodeType === Node.TEXT_NODE) {
    const entry = index.find((e) => e.node === node);
    return entry ? entry.start + offsetInNode : null;
  }

  // Element boundary: the point sits before child `node.childNodes[offset]`
  // (or at the very end when offset === childNodes.length). Find the first
  // indexed text node at or after that child and use its start.
  const child = node.childNodes[offsetInNode];
  if (!child) {
    // Point is at the end of this element — use the end of its last text node.
    let last: TextNodeEntry | undefined;
    for (const entry of index) {
      if (node.contains(entry.node)) last = entry;
    }
    return last ? last.end : null;
  }
  for (const entry of index) {
    if (
      entry.node === child ||
      child.contains(entry.node) ||
      child.compareDocumentPosition(entry.node) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ) {
      return entry.start;
    }
  }
  return null;
}

/**
 * Build a {@link HighlightAnchor} from the current text selection, or null if
 * the selection is empty/unanchorable. This is the create path.
 */
export function selectionToAnchor(
  root: Node,
  selection: Selection | null,
): HighlightAnchor | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  ) {
    return null;
  }

  const index = buildTextNodeIndex(root);
  const start = pointToOffset(index, range.startContainer, range.startOffset);
  const end = pointToOffset(index, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;

  const fullText = getAnchorText(root);
  const text = fullText.slice(start, end);
  if (!text.trim()) return null;

  const { contextPrefix, contextSuffix } = extractContext(fullText, start, end);
  return {
    text,
    startOffset: start,
    endOffset: end,
    contextPrefix,
    contextSuffix,
    version: HIGHLIGHT_ANCHOR_VERSION,
    anchorContentHash: hashAnchorText(fullText),
  };
}

export type ResolvedHighlight =
  | {
      status: "anchored";
      range: Range;
      startOffset: number;
      endOffset: number;
      /** True if offsets were recovered via quote search and should be persisted. */
      relocated: boolean;
      anchorContentHash: string;
    }
  | { status: "lost"; range: null };

/**
 * Resolve a stored highlight against the current DOM, returning a Range. This is
 * the restore path. When the content hash still matches, offsets are trusted
 * directly (fast, no searching). Otherwise the quote/context selector is used to
 * relocate the highlight; if that fails too, it's reported as "lost".
 */
export function resolveHighlight(
  root: Node,
  stored: {
    text: string;
    startOffset: number;
    endOffset: number;
    contextPrefix?: string | null;
    contextSuffix?: string | null;
    anchorContentHash?: string | null;
  },
): ResolvedHighlight {
  const fullText = getAnchorText(root);
  const currentHash = hashAnchorText(fullText);
  const index = buildTextNodeIndex(root);

  // Fast path: content unchanged and offsets still point at the stored text.
  if (
    stored.anchorContentHash === currentHash &&
    fullText.slice(stored.startOffset, stored.endOffset) === stored.text
  ) {
    const range = rangeFromOffsets(
      root,
      stored.startOffset,
      stored.endOffset,
      index,
    );
    if (range) {
      return {
        status: "anchored",
        range,
        startOffset: stored.startOffset,
        endOffset: stored.endOffset,
        relocated: false,
        anchorContentHash: currentHash,
      };
    }
  }

  // Fallback: relocate via the quote/context selector.
  const found = findQuoteOffsets(fullText, {
    text: stored.text,
    contextPrefix: stored.contextPrefix ?? "",
    contextSuffix: stored.contextSuffix ?? "",
  });
  if (found) {
    const range = rangeFromOffsets(root, found.start, found.end, index);
    if (range) {
      return {
        status: "anchored",
        range,
        startOffset: found.start,
        endOffset: found.end,
        relocated: true,
        anchorContentHash: currentHash,
      };
    }
  }

  return { status: "lost", range: null };
}
