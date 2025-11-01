/**
 * Text anchoring utilities for robust highlight positioning
 * Implements TextPosition and TextQuote selectors for reliable re-anchoring
 */

/**
 * Get plain text content from a DOM element (normalized whitespace)
 */
export function getTextContent(root: HTMLElement): string {
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
 * Convert text offsets to a DOM Range
 */
export function offsetsToRange(
  root: HTMLElement,
  startOffset: number,
  endOffset: number,
): Range | null {
  const textContent = getTextContent(root);
  if (
    startOffset < 0 ||
    endOffset > textContent.length ||
    startOffset > endOffset
  ) {
    return null;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);

  let currentOffset = 0;
  let startNode: Node | null = null;
  let startNodeOffset = 0;
  let endNode: Node | null = null;
  let endNodeOffset = 0;

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const nodeLength = node.textContent?.length ?? 0;

    // Check if start is in this node
    if (!startNode && currentOffset + nodeLength >= startOffset) {
      startNode = node;
      startNodeOffset = startOffset - currentOffset;
    }

    // Check if end is in this node
    if (!endNode && currentOffset + nodeLength >= endOffset) {
      endNode = node;
      endNodeOffset = endOffset - currentOffset;
    }

    if (startNode && endNode) break;

    currentOffset += nodeLength;
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
 * Extract prefix and suffix text around a selection
 */
export function extractPrefixSuffix(
  root: HTMLElement,
  range: Range,
  contextLength: number = 32,
): { prefix: string; suffix: string } {
  const textContent = getTextContent(root);

  // Find the offset of the range start
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(root);
  preCaretRange.setEnd(range.startContainer, range.startOffset);
  const startOffset = preCaretRange.toString().length;

  const endOffset = startOffset + range.toString().length;

  const prefixStart = Math.max(0, startOffset - contextLength);
  const prefix = textContent.slice(prefixStart, startOffset).trim();

  const suffixEnd = Math.min(textContent.length, endOffset + contextLength);
  const suffix = textContent.slice(endOffset, suffixEnd).trim();

  return { prefix, suffix };
}

/**
 * Find text by TextQuote selector (exact match with optional prefix/suffix)
 * Uses flexible matching that handles whitespace differences
 */
export function findByTextQuote(
  root: HTMLElement,
  quote: {
    exact: string;
    prefix?: string;
    suffix?: string;
  },
): { startOffset: number; endOffset: number } | null {
  const textContent = getTextContent(root);
  const exact = quote.exact.trim();

  if (!exact) return null;

  // First, try exact match in original text
  let searchStart = 0;
  let matchIndex: number;

  while ((matchIndex = textContent.indexOf(exact, searchStart)) !== -1) {
    const matchStart = matchIndex;
    const matchEnd = matchStart + exact.length;

    // If prefix/suffix are provided, verify them with flexible matching
    if (quote.prefix || quote.suffix) {
      const prefix = quote.prefix ? quote.prefix.trim() : null;
      const suffix = quote.suffix ? quote.suffix.trim() : null;

      // Check prefix (use flexible whitespace matching)
      let prefixMatch = true;
      if (prefix) {
        const prefixText = textContent.slice(
          Math.max(0, matchStart - 200),
          matchStart,
        );
        const normalizedPrefixText = prefixText.replace(/\s+/g, " ");
        const normalizedPrefix = prefix.replace(/\s+/g, " ");
        prefixMatch = normalizedPrefixText.endsWith(normalizedPrefix);
      }

      // Check suffix (use flexible whitespace matching)
      let suffixMatch = true;
      if (suffix) {
        const suffixText = textContent.slice(
          matchEnd,
          Math.min(textContent.length, matchEnd + 200),
        );
        const normalizedSuffixText = suffixText.replace(/\s+/g, " ");
        const normalizedSuffix = suffix.replace(/\s+/g, " ");
        suffixMatch = normalizedSuffixText.startsWith(normalizedSuffix);
      }

      if (prefixMatch && suffixMatch) {
        return { startOffset: matchStart, endOffset: matchEnd };
      }
    } else {
      // No prefix/suffix, use first exact match
      return { startOffset: matchStart, endOffset: matchEnd };
    }

    searchStart = matchIndex + 1;
  }

  // Fallback: try with normalized whitespace matching
  const normalizedExact = exact.replace(/\s+/g, " ").trim();
  const normalizedTextContent = textContent.replace(/\s+/g, " ");

  const normalizedMatchIndex = normalizedTextContent.indexOf(
    normalizedExact,
    0,
  );
  if (normalizedMatchIndex !== -1) {
    // Find the corresponding position in original text by matching words
    const words = normalizedExact.split(/\s+/).filter((w) => w.length > 0);
    if (words.length > 0) {
      // Find first word in original text
      const firstWord = words[0];
      const firstWordIndex = textContent.indexOf(firstWord, 0);

      if (firstWordIndex !== -1) {
        // Try to verify by checking if we can find a matching sequence
        // Count words from firstWordIndex to find the approximate end
        let wordCount = 0;
        let charIndex = firstWordIndex;
        let inWord = false;

        // Count words to match the normalized text length
        while (charIndex < textContent.length && wordCount < words.length) {
          const char = textContent[charIndex];
          if (char && /\S/.test(char)) {
            if (!inWord) {
              wordCount++;
              inWord = true;
            }
            charIndex++;
          } else {
            inWord = false;
            charIndex++;
          }
        }

        if (wordCount === words.length) {
          // Verify the match by checking the text content
          const matchText = textContent.slice(firstWordIndex, charIndex);
          const normalizedMatch = matchText.replace(/\s+/g, " ").trim();
          if (normalizedMatch === normalizedExact) {
            return { startOffset: firstWordIndex, endOffset: charIndex };
          }
        }
      }
    }
  }

  return null;
}

/**
 * Hash content using a simple hash function (for content change detection)
 */
export function hashContent(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Re-anchor a highlight by trying position first, then quote selector
 */
export function reanchor(
  root: HTMLElement,
  highlight: {
    startOffset: number;
    endOffset: number;
    text: string;
    quoteExact?: string | null;
    quotePrefix?: string | null;
    quoteSuffix?: string | null;
  },
): { startOffset: number; endOffset: number } | null {
  // Try position-based anchoring first
  const range = offsetsToRange(
    root,
    highlight.startOffset,
    highlight.endOffset,
  );
  if (range) {
    const rangeText = range.toString();
    // Normalize whitespace for comparison (collapse multiple spaces/newlines to single space)
    const normalizedRangeText = rangeText.replace(/\s+/g, " ").trim();
    const normalizedHighlightText = highlight.text.replace(/\s+/g, " ").trim();

    // Verify the text matches (allowing for whitespace differences)
    if (normalizedRangeText === normalizedHighlightText) {
      // Recalculate offsets (they might have shifted slightly)
      const preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(root);
      preCaretRange.setEnd(range.startContainer, range.startOffset);
      const startOffset = preCaretRange.toString().length;
      const endOffset = startOffset + rangeText.length;
      return { startOffset, endOffset };
    }
  }

  // Fall back to quote-based anchoring
  if (highlight.quoteExact) {
    // Try with original quote first
    const quoteMatch = findByTextQuote(root, {
      exact: highlight.quoteExact,
      prefix: highlight.quotePrefix ?? undefined,
      suffix: highlight.quoteSuffix ?? undefined,
    });

    if (quoteMatch) {
      return quoteMatch;
    }

    // If that fails, try with normalized quote
    const normalizedQuote = highlight.quoteExact.replace(/\s+/g, " ").trim();

    const normalizedMatch = findByTextQuote(root, {
      exact: normalizedQuote,
      prefix: highlight.quotePrefix
        ? highlight.quotePrefix.replace(/\s+/g, " ").trim()
        : undefined,
      suffix: highlight.quoteSuffix
        ? highlight.quoteSuffix.replace(/\s+/g, " ").trim()
        : undefined,
    });

    if (normalizedMatch) {
      return normalizedMatch;
    }
  }

  return null;
}
