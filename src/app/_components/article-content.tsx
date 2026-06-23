/**
 * Article Content Component
 * Renders the article content
 */

"use client";

import { memo, useMemo, type RefObject } from "react";

interface ArticleContentProps {
  content: string;
  fontSize: number;
  contentRef: RefObject<HTMLDivElement | null>;
}

function ArticleContentImpl({
  content,
  fontSize,
  contentRef,
}: ArticleContentProps) {
  // Stabilize the dangerouslySetInnerHTML object identity. React 19 diffs this
  // prop by object reference, so a fresh `{ __html }` literal every render makes
  // React re-set innerHTML — destroying and rebuilding the whole subtree
  // (including embedded iframes/videos) on every parent re-render (e.g. scroll).
  const html = useMemo(() => ({ __html: content }), [content]);

  return (
    <div
      ref={contentRef}
      className="article-content min-w-0 w-full max-w-none leading-relaxed text-foreground"
      style={{
        fontFamily: "var(--font-app-reading)",
        fontSize: `${fontSize}px`,
        lineHeight: 1.7,
      }}
    >
      <div dangerouslySetInnerHTML={html} />
    </div>
  );
}

// Memoize so per-frame scroll re-renders of the parent reader don't re-render
// (and re-commit) the article body. All props are referentially stable.
export const ArticleContent = memo(ArticleContentImpl);
