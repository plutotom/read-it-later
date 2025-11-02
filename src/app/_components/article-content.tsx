/**
 * Article Content Component
 * Renders the article content with highlighting support
 */

"use client";

import { type RefObject } from "react";
import { type Highlight } from "~/types/annotation";

interface ArticleContentProps {
  content: string;
  fontSize: number;
  contentRef: RefObject<HTMLDivElement | null>;
  onTextSelection: () => void;
  onHighlightClick: (highlightId: string | null) => void;
  highlights: Highlight[];
}

export function ArticleContent({
  content,
  fontSize,
  contentRef,
  onTextSelection,
  onHighlightClick,
  highlights,
}: ArticleContentProps) {
  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Check if clicking on a highlight
    // Support both old mark[data-hl-id] and new highlighter-span[data-highlight-id]
    const target = e.target as HTMLElement;
    const hlId =
      target.getAttribute("data-hl-id") ??
      target.getAttribute("data-highlight-id") ??
      target.closest("[data-hl-id]")?.getAttribute("data-hl-id") ??
      target.closest("[data-highlight-id]")?.getAttribute("data-highlight-id");
    
    if (hlId) {
      // Try to find highlight by ID (UUID string) or by matching the highlightIndex
      const highlight = highlights.find((h) => h.id === hlId);
      onHighlightClick(highlight ? highlight.id : null);
    } else {
      onHighlightClick(null);
    }
  };

  return (
    <div
      ref={contentRef}
      className="article-content max-w-none leading-relaxed"
      style={{ fontSize: `${fontSize}px`, lineHeight: 1.6 }}
      onMouseUp={onTextSelection}
      onTouchEnd={onTextSelection}
      onClick={handleContentClick}
    >
      <div dangerouslySetInnerHTML={{ __html: content }} />
    </div>
  );
}

