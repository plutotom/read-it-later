/**
 * Public Article Reader Component
 * Matches the authenticated reader layout (theme, typography, docked audio).
 */

"use client";

import {
  type Article,
  type ArticleMetadata as ArticleMeta,
} from "~/types/article";
import { useState, useRef, useEffect, useCallback } from "react";
import { PublicArticleReaderHeader } from "./public-article-reader-header";
import { ArticleMetadata } from "./article-metadata";
import { ArticleContent } from "./article-content";
import { AudioPlayer } from "./audio-player";
import { cn } from "~/lib/utils";

interface PublicArticleReaderProps {
  article: Article;
  shareToken: string;
}

const DEFAULT_FONT_SIZE = 19;

export function PublicArticleReader({
  article,
  shareToken,
}: PublicArticleReaderProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef(0);
  const hideScrollAccumulatorRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [isPlayerVisible, setIsPlayerVisible] = useState(true);

  const articleImageUrl = (() => {
    const meta = article.metadata as ArticleMeta | null | undefined;
    return meta?.imageUrl ?? null;
  })();

  const handleJumpToReadingPosition = useCallback(
    (progressRatio: number) => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const maxScroll = scroller.scrollHeight - scroller.clientHeight;
      if (maxScroll <= 0) return;
      scroller.scrollTo({
        top: maxScroll * Math.min(1, Math.max(0, progressRatio)),
        behavior: "smooth",
      });
    },
    [],
  );

  useEffect(() => {
    lastScrollTopRef.current = 0;
    hideScrollAccumulatorRef.current = 0;
    setIsPlayerVisible(true);
  }, [article.id]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const onScroll = () => {
      const scrollTop = el.scrollTop;
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? (scrollTop / max) * 100 : 0);

      const delta = scrollTop - lastScrollTopRef.current;
      if (scrollTop <= 12) {
        hideScrollAccumulatorRef.current = 0;
        setIsPlayerVisible(true);
      } else if (delta > 0) {
        hideScrollAccumulatorRef.current += delta;
        if (hideScrollAccumulatorRef.current >= 48) {
          setIsPlayerVisible(false);
        }
      } else if (delta < 0) {
        hideScrollAccumulatorRef.current = 0;
        setIsPlayerVisible(true);
      }
      lastScrollTopRef.current = scrollTop;
    };

    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [article.id]);

  return (
    <div className="relative flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-background pt-[env(safe-area-inset-top,0px)]">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden m-slide-in">
        <PublicArticleReaderHeader article={article} />

        <div className="h-[2px] bg-background-deep">
          <div
            className="h-full bg-accent transition-[width] duration-150 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div
          ref={scrollerRef}
          className="flex-1 min-h-0 overflow-y-auto px-5 pt-8 pb-36 sm:px-8 sm:pt-12 sm:pb-40"
        >
          <article className="mx-auto max-w-[640px]">
            <ArticleMetadata article={article} />
            <ArticleContent
              content={article.content}
              fontSize={DEFAULT_FONT_SIZE}
              contentRef={contentRef}
              onTextSelection={() => undefined}
            />
          </article>
        </div>
      </div>

      <div
        className={cn(
          "reader-audio-dock reader-audio-dock-bottom pointer-events-none absolute inset-x-0 z-30 px-5 sm:px-8",
          isPlayerVisible
            ? "reader-audio-dock--visible"
            : "reader-audio-dock--hidden",
        )}
      >
        <div
          key={article.id}
          className={cn(
            "reader-audio-dock__inner reader-audio-dock__inner--enter mx-auto max-w-[640px]",
            isPlayerVisible ? "pointer-events-auto" : "pointer-events-none",
          )}
        >
          <AudioPlayer
            articleId={article.id}
            articleTitle={article.title}
            articleUrl={article.url}
            articleAuthor={article.author}
            articleImageUrl={articleImageUrl}
            shareToken={shareToken}
            onJumpToReadingPosition={handleJumpToReadingPosition}
          />
        </div>
      </div>
    </div>
  );
}
