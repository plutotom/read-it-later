/**
 * Highlight Renderer
 * DOM-based text highlighting that handles cross-element highlights
 * Uses text offsets and context matching for robust re-anchoring
 */

import type { Highlight, HighlightColor } from "~/types/annotation";

interface TextNodeEntry {
  node: Text;
  startOffset: number;
  endOffset: number;
}

interface HighlightRange {
  highlight: Highlight;
  startOffset: number;
  endOffset: number;
}

/**
 * Normalize whitespace for comparison (collapse multiple spaces/newlines)
 */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Get plain text content from DOM element
 */
function getPlainText(root: HTMLElement): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);

  let text = "";
  let node: Node | null;

  while ((node = walker.nextNode())) {
    if (node.textContent) {
      text += node.textContent;
    }
  }

  return text;
}

/**
 * Build mapping of text nodes to their positions in plain text
 */
function buildTextNodeMap(root: HTMLElement): TextNodeEntry[] {
  const nodeMap: TextNodeEntry[] = [];
  let currentOffset = 0;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);

  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text;
      const length = textNode.textContent?.length ?? 0;

      if (length > 0) {
        nodeMap.push({
          node: textNode,
          startOffset: currentOffset,
          endOffset: currentOffset + length,
        });
        currentOffset += length;
      }
    }
  }

  return nodeMap;
}

/**
 * Find text node entry at a given offset
 */
function findEntryAtOffset(
  nodeMap: TextNodeEntry[],
  offset: number,
): TextNodeEntry | null {
  for (const entry of nodeMap) {
    if (offset >= entry.startOffset && offset < entry.endOffset) {
      return entry;
    }
  }
  return null;
}

/**
 * Find all matches of text in plain text string
 */
function findAllMatches(text: string, searchText: string): number[] {
  const matches: number[] = [];
  const normalizedSearch = normalizeWhitespace(searchText);
  const normalizedText = normalizeWhitespace(text);

  let searchStart = 0;
  let matchIndex: number;

  // First try exact match
  while ((matchIndex = text.indexOf(searchText, searchStart)) !== -1) {
    matches.push(matchIndex);
    searchStart = matchIndex + 1;
  }

  // If no exact matches, try normalized
  if (matches.length === 0 && normalizedSearch.length > 0) {
    searchStart = 0;
    while (
      (matchIndex = normalizedText.indexOf(normalizedSearch, searchStart)) !==
      -1
    ) {
      // Map back to original text offset (approximate)
      const originalOffset = mapNormalizedToOriginal(text, matchIndex);
      if (originalOffset !== -1) {
        matches.push(originalOffset);
      }
      searchStart = matchIndex + 1;
    }
  }

  return matches;
}

/**
 * Map normalized text offset back to original text offset
 */
function mapNormalizedToOriginal(
  originalText: string,
  normalizedOffset: number,
): number {
  let originalOffset = 0;
  let normalizedOffsetCount = 0;

  for (let i = 0; i < originalText.length; i++) {
    if (normalizedOffsetCount >= normalizedOffset) {
      return originalOffset;
    }

    const char = originalText[i];
    if (char && /\s/.test(char)) {
      originalOffset++;
      // Skip consecutive whitespace
      while (
        i + 1 < originalText.length &&
        /\s/.test(originalText[i + 1] ?? "")
      ) {
        i++;
        originalOffset++;
      }
    } else {
      originalOffset++;
      normalizedOffsetCount++;
    }
  }

  return normalizedOffsetCount >= normalizedOffset ? originalOffset : -1;
}

/**
 * Check if context matches around a position
 */
function matchesContext(
  before: string,
  after: string,
  contextPrefix?: string | null,
  contextSuffix?: string | null,
): boolean {
  const normalizedBefore = normalizeWhitespace(before);
  const normalizedAfter = normalizeWhitespace(after);

  const prefixMatch = contextPrefix
    ? normalizedBefore.endsWith(normalizeWhitespace(contextPrefix))
    : true;

  const suffixMatch = contextSuffix
    ? normalizedAfter.startsWith(normalizeWhitespace(contextSuffix))
    : true;

  return prefixMatch && suffixMatch;
}

/**
 * Re-anchor a highlight to handle content changes and duplicate text
 */
function reanchorHighlight(
  root: HTMLElement,
  highlight: Highlight,
  nodeMap: TextNodeEntry[],
): HighlightRange | null {
  const plainText = getPlainText(root);

  // Fast path: check if offsets are still valid
  if (
    highlight.startOffset >= 0 &&
    highlight.startOffset < plainText.length &&
    highlight.endOffset > highlight.startOffset &&
    highlight.endOffset <= plainText.length
  ) {
    const textAtOffset = plainText.slice(
      highlight.startOffset,
      highlight.endOffset,
    );
    if (
      normalizeWhitespace(textAtOffset) === normalizeWhitespace(highlight.text)
    ) {
      // Offsets still valid!
      return {
        highlight,
        startOffset: highlight.startOffset,
        endOffset: highlight.endOffset,
      };
    }
  }

  // Find all matches of the highlight text
  const matches = findAllMatches(plainText, highlight.text);

  if (matches.length === 0) {
    return null; // Text not found
  }

  if (matches.length === 1) {
    // Single match - use it
    const startOffset = matches[0] ?? 0;
    return {
      highlight,
      startOffset,
      endOffset: startOffset + highlight.text.length,
    };
  }

  // Multiple matches - use context to disambiguate
  if (highlight.contextPrefix || highlight.contextSuffix) {
    for (const matchOffset of matches) {
      const before = plainText.slice(
        Math.max(0, matchOffset - 50),
        matchOffset,
      );
      const after = plainText.slice(
        matchOffset + highlight.text.length,
        Math.min(plainText.length, matchOffset + highlight.text.length + 50),
      );

      if (
        matchesContext(
          before,
          after,
          highlight.contextPrefix,
          highlight.contextSuffix,
        )
      ) {
        return {
          highlight,
          startOffset: matchOffset,
          endOffset: matchOffset + highlight.text.length,
        };
      }
    }
  }

  // Fallback: use match closest to original offset
  const closest = matches.reduce((best, offset) => {
    return Math.abs(offset - highlight.startOffset) <
      Math.abs(best - highlight.startOffset)
      ? offset
      : best;
  }, matches[0] ?? 0);

  return {
    highlight,
    startOffset: closest,
    endOffset: closest + highlight.text.length,
  };
}

/**
 * Split a text node at a given character offset
 */
function splitTextNodeAtOffset(textNode: Text, offset: number): Text {
  const text = textNode.textContent ?? "";
  if (offset <= 0 || offset >= text.length) {
    return textNode;
  }

  const before = text.slice(0, offset);
  const after = text.slice(offset);

  textNode.textContent = before;

  const newNode = document.createTextNode(after);
  textNode.parentNode?.insertBefore(newNode, textNode.nextSibling);

  return newNode;
}

/**
 * Wrap a text node in a mark element
 */
function wrapTextNodeInMark(
  textNode: Text,
  highlightId: string,
  color: HighlightColor,
): HTMLElement {
  const mark = document.createElement("mark");
  mark.setAttribute("data-hl-id", highlightId);
  mark.className = `highlight-${color} cursor-pointer`;
  mark.style.backgroundColor = getHighlightColor(color);
  mark.style.color = "inherit";
  mark.style.padding = "2px 0";
  mark.style.borderRadius = "2px";

  const parent = textNode.parentNode;
  if (parent) {
    parent.insertBefore(mark, textNode);
    mark.appendChild(textNode);
  }

  return mark;
}

/**
 * Get highlight color CSS value
 */
function getHighlightColor(color: HighlightColor): string {
  const colors: Record<HighlightColor, string> = {
    yellow: "#fbbf24",
    green: "#34d399",
    blue: "#60a5fa",
    pink: "#f472b6",
    purple: "#a78bfa",
    orange: "#fb923c",
    red: "#f87171",
    gray: "#9ca3af",
  };
  return colors[color] ?? colors.yellow;
}

/**
 * Get next text node in document order
 */
function getNextTextNode(node: Node, root: HTMLElement): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);

  // Find current node
  let found = false;
  let current: Node | null;
  while ((current = walker.nextNode())) {
    if (current === node) {
      found = true;
      break;
    }
  }

  if (!found) return null;

  // Get next text node
  return (walker.nextNode() as Text) ?? null;
}

/**
 * Wrap a single text node range
 */
function wrapSingleNodeRange(
  entry: TextNodeEntry,
  startOffset: number,
  endOffset: number,
  highlightId: string,
  color: HighlightColor,
): void {
  const { node } = entry;
  const nodeStart = entry.startOffset;
  const nodeEnd = entry.endOffset;

  // Calculate offsets within this node
  const localStart = startOffset - nodeStart;
  const localEnd = endOffset - nodeStart;

  if (localStart <= 0 && localEnd >= nodeEnd - nodeStart) {
    // Wrap entire node
    wrapTextNodeInMark(node, highlightId, color);
  } else {
    // Split and wrap middle portion
    if (localStart > 0) {
      splitTextNodeAtOffset(node, localStart);
    }

    // Find the node containing the end (might have changed after split)
    const currentText = node.textContent ?? "";
    const currentLength = currentText.length;

    if (localEnd < currentLength) {
      const middleNode = localStart > 0 ? node.nextSibling : node;
      if (middleNode && middleNode.nodeType === Node.TEXT_NODE) {
        splitTextNodeAtOffset(middleNode as Text, localEnd - localStart);
        wrapTextNodeInMark(middleNode as Text, highlightId, color);
      }
    } else {
      wrapTextNodeInMark(node, highlightId, color);
    }
  }
}

/**
 * Get all text nodes in order from root
 */
function getAllTextNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);

  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      nodes.push(node as Text);
    }
  }

  return nodes;
}

/**
 * Convert offsets to a DOM Range
 */
function offsetsToRange(
  root: HTMLElement,
  startOffset: number,
  endOffset: number,
): Range | null {
  const nodeMap = buildTextNodeMap(root);

  let startNode: Text | null = null;
  let startNodeOffset = 0;
  let endNode: Text | null = null;
  let endNodeOffset = 0;

  for (const entry of nodeMap) {
    // Check if start is in this node
    if (!startNode && entry.endOffset > startOffset) {
      startNode = entry.node;
      startNodeOffset = startOffset - entry.startOffset;
    }

    // Check if end is in this node
    if (!endNode && entry.endOffset >= endOffset) {
      endNode = entry.node;
      endNodeOffset = endOffset - entry.startOffset;
      break;
    }
  }

  if (!startNode || !endNode) {
    return null;
  }

  try {
    const range = document.createRange();
    range.setStart(startNode, startNodeOffset);
    range.setEnd(endNode, endNodeOffset);
    return range;
  } catch {
    return null;
  }
}

/**
 * Get all text nodes within a range
 */
function getTextNodesInRange(range: Range): Text[] {
  const textNodes: Text[] = [];

  // If range is collapsed, return empty
  if (range.collapsed) {
    return textNodes;
  }

  // Use RangeContents to get all contents
  const contents = range.cloneContents();

  // Walk through the document to find text nodes that are within the range
  const startContainer = range.startContainer;
  const endContainer = range.endContainer;
  const startOffset = range.startOffset;
  const endOffset = range.endOffset;

  // If range is within a single text node
  if (
    startContainer === endContainer &&
    startContainer.nodeType === Node.TEXT_NODE
  ) {
    return [startContainer as Text];
  }

  // Walk from start to end
  const walker = document.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
    null,
  );

  let node: Node | null;
  let foundStart = false;

  while ((node = walker.nextNode())) {
    if (node === startContainer) {
      foundStart = true;
      // If start is in a text node, check if we need partial
      if (startContainer.nodeType === Node.TEXT_NODE) {
        textNodes.push(startContainer as Text);
      }
      continue;
    }

    if (foundStart) {
      if (node.nodeType === Node.TEXT_NODE) {
        textNodes.push(node as Text);
      }

      // Stop when we reach the end
      if (node === endContainer) {
        break;
      }
    }
  }

  return textNodes;
}

/**
 * Wrap a range spanning multiple text nodes
 */
function wrapMultiNodeRange(
  startEntry: TextNodeEntry,
  endEntry: TextNodeEntry,
  startOffset: number,
  endOffset: number,
  highlightId: string,
  color: HighlightColor,
  root: HTMLElement,
): void {
  // Split nodes at range boundaries BEFORE getting fresh node list
  // Split at start if needed
  if (startOffset > startEntry.startOffset) {
    const localStart = startOffset - startEntry.startOffset;
    splitTextNodeAtOffset(startEntry.node, localStart);
  }

  // Split at end if needed
  if (endOffset < endEntry.endOffset) {
    const endLocal = endOffset - endEntry.startOffset;
    splitTextNodeAtOffset(endEntry.node, endLocal);
  }

  // Get fresh node map after splits
  const freshNodeMap = buildTextNodeMap(root);

  // Find which nodes contain our start and end offsets after splits
  let startNode: Text | null = null;
  let endNode: Text | null = null;

  for (const entry of freshNodeMap) {
    // Find node containing start offset
    if (
      !startNode &&
      entry.startOffset <= startOffset &&
      entry.endOffset > startOffset
    ) {
      startNode = entry.node;
    }
    // Find node containing end offset
    if (
      !endNode &&
      entry.startOffset < endOffset &&
      entry.endOffset >= endOffset
    ) {
      endNode = entry.node;
    }
    if (startNode && endNode) break;
  }

  if (!startNode || !endNode) {
    return;
  }

  // Get all text nodes and find indices of start and end
  const allTextNodes = getAllTextNodes(root);
  let startIdx = -1;
  let endIdx = -1;

  for (let i = 0; i < allTextNodes.length; i++) {
    if (allTextNodes[i] === startNode) {
      startIdx = i;
    }
    if (allTextNodes[i] === endNode) {
      endIdx = i;
    }
    if (startIdx !== -1 && endIdx !== -1) break;
  }

  if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) {
    return;
  }

  // Wrap all nodes from start to end (inclusive)
  for (let i = startIdx; i <= endIdx; i++) {
    const node = allTextNodes[i];
    // Skip if already wrapped in a mark
    if (node.parentNode?.nodeName === "MARK") {
      continue;
    }
    if (node.parentNode) {
      wrapTextNodeInMark(node, highlightId, color);
    }
  }
}

/**
 * Clear all existing highlights from DOM
 */
function clearHighlights(root: HTMLElement): void {
  const marks = root.querySelectorAll("mark[data-hl-id]");
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (parent) {
      // Replace mark with its text content
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
      parent.normalize(); // Merge adjacent text nodes
    }
  });
}

/**
 * Apply highlights to DOM element
 */
export function applyHighlightsToDOM(
  root: HTMLElement,
  highlights: Highlight[],
  onHighlightClick?: (highlight: Highlight) => void,
): void {
  if (!root || highlights.length === 0) {
    return;
  }

  // Clear existing highlights
  clearHighlights(root);

  // Build text node map
  const nodeMap = buildTextNodeMap(root);

  if (nodeMap.length === 0) {
    return;
  }

  // Re-anchor all highlights
  const anchoredHighlights = highlights
    .map((h) => reanchorHighlight(root, h, nodeMap))
    .filter((r): r is HighlightRange => r !== null)
    .sort((a, b) => a.startOffset - b.startOffset); // Process in order

  // Apply highlights
  for (const range of anchoredHighlights) {
    const startEntry = findEntryAtOffset(nodeMap, range.startOffset);
    const endEntry = findEntryAtOffset(nodeMap, range.endOffset);

    if (!startEntry || !endEntry) {
      continue;
    }

    if (startEntry.node === endEntry.node) {
      // Single text node
      wrapSingleNodeRange(
        startEntry,
        range.startOffset,
        range.endOffset,
        range.highlight.id,
        range.highlight.color,
      );
    } else {
      // Multiple text nodes
      wrapMultiNodeRange(
        startEntry,
        endEntry,
        range.startOffset,
        range.endOffset,
        range.highlight.id,
        range.highlight.color,
        root,
      );
    }

    // Rebuild node map after each highlight (structure changed)
    // This is necessary because wrapping changes the DOM structure
    const newMap = buildTextNodeMap(root);
    nodeMap.splice(0, nodeMap.length, ...newMap);
  }

  // Attach click handlers
  if (onHighlightClick) {
    const marks = root.querySelectorAll("mark[data-hl-id]");
    marks.forEach((mark) => {
      const highlightId = mark.getAttribute("data-hl-id");
      if (highlightId) {
        const highlight = highlights.find((h) => h.id === highlightId);
        if (highlight) {
          mark.addEventListener("click", (e) => {
            e.stopPropagation();
            onHighlightClick(highlight);
          });
        }
      }
    });
  }
}

/**
 * Extract context around a text selection
 */
export function extractContext(
  root: HTMLElement,
  startOffset: number,
  endOffset: number,
  contextLength: number = 30,
): { prefix: string; suffix: string } {
  const plainText = getPlainText(root);

  const prefixStart = Math.max(0, startOffset - contextLength);
  const prefix = plainText.slice(prefixStart, startOffset).trim();

  const suffixEnd = Math.min(plainText.length, endOffset + contextLength);
  const suffix = plainText.slice(endOffset, suffixEnd).trim();

  return { prefix, suffix };
}
