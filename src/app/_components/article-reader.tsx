/**
 * Article Reader Component
 * Mobile-optimized reading experience for articles with text highlighting
 */

"use client";

import { type Article } from "~/types/article";
import { useState, useRef, useEffect } from "react";
import { ArticleReaderHeader } from "./article-reader-header";
import { ArticleMetadata } from "./article-metadata";
import { ArticleContent } from "./article-content";

interface ArticleReaderProps {
  article: Article;
  onBackClick?: () => void;
  onMarkAsRead?: () => void;
}

export function ArticleReader({
  article,
  onBackClick,
  onMarkAsRead,
}: ArticleReaderProps) {
  const [fontSize, setFontSize] = useState(16);
  const [showSettings, setShowSettings] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const markedAsReadRef = useRef<string | null>(null);
  const onMarkAsReadRef = useRef(onMarkAsRead);

  // Keep ref updated with latest callback
  useEffect(() => {
    onMarkAsReadRef.current = onMarkAsRead;
  }, [onMarkAsRead]);

  // Mark article as read when it changes to unread
  useEffect(() => {
    if (
      !article.isRead &&
      onMarkAsReadRef.current &&
      markedAsReadRef.current !== article.id
    ) {
      markedAsReadRef.current = article.id;
      onMarkAsReadRef.current();
    }
    if (markedAsReadRef.current && markedAsReadRef.current !== article.id) {
      markedAsReadRef.current = null;
    }
  }, [article.id, article.isRead]);

  return (
    <div className="flex h-full flex-col bg-gray-900">
      <ArticleReaderHeader
        article={article}
        onBackClick={onBackClick}
        showSettings={showSettings}
        onToggleSettings={() => setShowSettings(!showSettings)}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
      />

      <div className="flex-1 overflow-y-auto">
        <article className="max-w-none px-4 py-6">
          <ArticleMetadata article={article} />
          {/* <StandaloneNotes notes={notes} /> */}
          <ArticleContent
            content={article.content}
            fontSize={fontSize}
            contentRef={contentRef}
          />
        </article>
      </div>

      {/* <HighlightStyles /> */}
    </div>
  );
}
