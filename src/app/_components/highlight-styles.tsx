/**
 * Highlight Styles Component
 * CSS styles for highlight elements (both old and new systems)
 */

"use client";

export function HighlightStyles() {
  return (
    <style jsx global>{`
      @supports (background-color: Highlight) {
        mark[data-hl-id],
        highlighter-span[data-highlight-id] {
          background-color: Highlight;
          color: HighlightText;
        }
      }
      /* Support both old mark elements and new highlighter-span elements */
      mark[data-hl-id],
      highlighter-span[data-highlight-id] {
        cursor: pointer;
        border-radius: 2px;
        padding: 2px 0;
        transition: opacity 0.2s;
      }
      mark[data-hl-id]:hover,
      highlighter-span[data-highlight-id]:hover {
        opacity: 0.8;
      }
      /* Legacy class-based highlights (for old renderer) */
      .highlight-yellow {
        background-color: #fbbf24;
        color: #1f2937;
      }
      .highlight-green {
        background-color: #34d399;
        color: #1f2937;
      }
      .highlight-blue {
        background-color: #60a5fa;
        color: #1f2937;
      }
      .highlight-pink {
        background-color: #f472b6;
        color: #1f2937;
      }
      .highlight-purple {
        background-color: #a78bfa;
        color: #1f2937;
      }
      .highlight-orange {
        background-color: #fb923c;
        color: #1f2937;
      }
      .highlight-red {
        background-color: #f87171;
        color: #1f2937;
      }
      .highlight-gray {
        background-color: #9ca3af;
        color: #1f2937;
      }
    `}</style>
  );
}


