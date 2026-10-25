import {
  getAnchorText,
  hashAnchorText,
  resolveHighlight,
  type ResolvedHighlight,
} from "./highlight-anchor";

export interface PaintableHighlightAnchor {
  text: string;
  startOffset: number;
  endOffset: number;
  contextPrefix?: string | null;
  contextSuffix?: string | null;
  anchorContentHash?: string | null;
  anchorSpace?: string | null;
  webAnchor?: unknown;
}

/** Native selectors never fall through to the legacy DOM quote re-anchorer. */
export function resolvePaintableHighlight(
  root: Node,
  stored: PaintableHighlightAnchor,
): ResolvedHighlight {
  if (!stored.anchorSpace || stored.anchorSpace === "web-dom-v1")
    return resolveHighlight(root, stored);
  if (!["local-text-v1", "paper-drive-text-v1"].includes(stored.anchorSpace))
    return { status: "lost", range: null };
  const raw = stored.webAnchor;
  if (!raw || typeof raw !== "object") return { status: "lost", range: null };
  const anchor = raw as Record<string, unknown>;
  const fullText = getAnchorText(root);
  if (
    typeof anchor.text !== "string" ||
    typeof anchor.contentHash !== "string" ||
    typeof anchor.startOffset !== "number" ||
    typeof anchor.endOffset !== "number" ||
    !Number.isSafeInteger(anchor.startOffset) ||
    !Number.isSafeInteger(anchor.endOffset) ||
    anchor.startOffset < 0 ||
    anchor.endOffset <= anchor.startOffset ||
    anchor.endOffset > fullText.length ||
    anchor.contentHash !== hashAnchorText(fullText) ||
    fullText.slice(anchor.startOffset, anchor.endOffset) !== anchor.text
  )
    return { status: "lost", range: null };
  // Resolve only against the verified current hash. Never write this derived
  // placement back into the original native selector columns.
  const resolved = resolveHighlight(root, {
    text: anchor.text,
    startOffset: anchor.startOffset,
    endOffset: anchor.endOffset,
    anchorContentHash: anchor.contentHash,
  });
  return resolved.status === "anchored" && !resolved.relocated
    ? resolved
    : { status: "lost", range: null };
}
