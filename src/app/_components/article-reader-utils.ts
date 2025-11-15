/**
 * Article Reader Utility Functions
 * Helper functions for the article reader component
 */

import { type HighlightColor } from "~/types/annotation";

/**
 * Get hex color value from HighlightColor
 */
export function getHighlightColorHex(color: HighlightColor): string {
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
