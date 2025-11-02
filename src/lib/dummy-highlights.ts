/**
 * Dummy highlight data for testing
 *
 * Usage:
 * - Import this file and use `dummyHighlights` or `getDummyHighlights()`
 * - Convert to Highlight[] type if needed for testing ArticleReader component
 *
 * Example:
 * ```typescript
 * import { dummyHighlights } from "~/lib/dummy-highlights";
 * import type { Highlight } from "~/types/annotation";
 *
 * // Convert HighlightData[] to Highlight[] for testing
 * const testHighlights: Highlight[] = dummyHighlights.map((h, i) => ({
 *   id: `dummy-${i}`,
 *   articleId: "test-article-id",
 *   text: h.text,
 *   startOffset: h.startOffset,
 *   endOffset: h.endOffset,
 *   color: h.color as HighlightColor,
 *   note: null,
 *   createdAt: new Date(),
 *   updatedAt: new Date(),
 * }));
 * ```
 */

import type { HighlightData } from "./highlihgter-util";

export const dummyHighlights: HighlightData[] = [
  {
    text: "This is an example highlight",
    startOffset: 0,
    endOffset: 29,
    color: "yellow",
    textColor: "black",
    highlightIndex: 0,
  },
  {
    text: "another example of highlighted text",
    startOffset: 100,
    endOffset: 140,
    color: "blue",
    textColor: "white",
    highlightIndex: 1,
  },
];

/**
 * Get dummy highlights - can be modified to load from JSON file or API
 */
export function getDummyHighlights(): HighlightData[] {
  return dummyHighlights;
}
