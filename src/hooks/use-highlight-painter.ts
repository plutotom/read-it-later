"use client";

/**
 * Paints highlights onto the article using the CSS Custom Highlight API.
 *
 * Why this approach: the article body is rendered via `dangerouslySetInnerHTML`,
 * and mutating that subtree to wrap highlights is exactly what caused the old
 * flashing. The Custom Highlight API registers `Range` objects with the browser
 * and paints them via `::highlight(...)` — zero DOM mutation, so the existing
 * render (and the TOC/TTS logic that depends on it) is untouched.
 *
 * Resolution runs once per change of the highlight list or the article content
 * (keyed by `contentKey`), not on every React render. Highlights that had to be
 * relocated (content shifted) or could not be found are reported back so the
 * caller can persist the new offsets or surface a "lost" state.
 */
import { useEffect, type RefObject } from "react";
import { resolveHighlight } from "~/lib/highlight-anchor";

/** Registry name per color, e.g. "ril-hl-yellow". CSS targets `::highlight(...)`. */
const REGISTRY_PREFIX = "ril-hl-";

type PaintableHighlight = {
  id: string;
  text: string;
  startOffset: number;
  endOffset: number;
  color: string;
  contextPrefix?: string | null;
  contextSuffix?: string | null;
  anchorContentHash?: string | null;
};

export type RelocatedHighlight = {
  id: string;
  startOffset: number;
  endOffset: number;
  anchorContentHash: string;
};

type Options = {
  contentRef: RefObject<HTMLElement | null>;
  highlights: PaintableHighlight[];
  /** Changes whenever the rendered article DOM changes (invalidates Ranges). */
  contentKey: string;
  onRelocated?: (relocated: RelocatedHighlight[]) => void;
  onLost?: (ids: string[]) => void;
};

/** Feature-detect the Custom Highlight API without tripping TS lib gaps. */
function getHighlightRegistry():
  | { set: (name: string, hl: object) => void; delete: (name: string) => void }
  | null {
  if (typeof CSS === "undefined") return null;
  const highlights = (CSS as unknown as { highlights?: unknown }).highlights;
  if (!highlights) return null;
  if (typeof (globalThis as { Highlight?: unknown }).Highlight !== "function") {
    return null;
  }
  return highlights as {
    set: (name: string, hl: object) => void;
    delete: (name: string) => void;
  };
}

export function useHighlightPainter({
  contentRef,
  highlights,
  contentKey,
  onRelocated,
  onLost,
}: Options) {
  useEffect(() => {
    const root = contentRef.current;
    const registry = getHighlightRegistry();
    if (!root || !registry) return;

    const HighlightCtor = (globalThis as unknown as {
      Highlight: new (...ranges: Range[]) => object;
    }).Highlight;

    const rangesByColor = new Map<string, Range[]>();
    const relocated: RelocatedHighlight[] = [];
    const lost: string[] = [];

    for (const h of highlights) {
      const resolved = resolveHighlight(root, h);
      if (resolved.status === "lost") {
        lost.push(h.id);
        continue;
      }
      const ranges = rangesByColor.get(h.color) ?? [];
      ranges.push(resolved.range);
      rangesByColor.set(h.color, ranges);
      if (resolved.relocated) {
        relocated.push({
          id: h.id,
          startOffset: resolved.startOffset,
          endOffset: resolved.endOffset,
          anchorContentHash: resolved.anchorContentHash,
        });
      }
    }

    const registeredNames: string[] = [];
    for (const [color, ranges] of rangesByColor) {
      const name = `${REGISTRY_PREFIX}${color}`;
      registry.set(name, new HighlightCtor(...ranges));
      registeredNames.push(name);
    }

    if (relocated.length > 0) onRelocated?.(relocated);
    if (lost.length > 0) onLost?.(lost);

    return () => {
      for (const name of registeredNames) registry.delete(name);
    };
  }, [contentRef, highlights, contentKey, onRelocated, onLost]);
}
