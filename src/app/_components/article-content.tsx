/**
 * Article Content Component
 * Renders the article content with highlighting support
 */

"use client";

import { type RefObject } from "react";

interface ArticleContentProps {
  content: string;
  fontSize: number;
  contentRef: RefObject<HTMLDivElement | null>;
}

export function ArticleContent({
  content,
  fontSize,
  contentRef,
}: ArticleContentProps) {
  return (
    <div
      ref={contentRef}
      className="article-content max-w-none leading-relaxed"
      style={{ fontSize: `${fontSize}px`, lineHeight: 1.6 }}
    >
      <div dangerouslySetInnerHTML={{ __html: content }} />
    </div>
  );
}
