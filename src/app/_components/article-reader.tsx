/**
 * Article Reader Component
 * Mobile-optimized reading experience for articles
 */

"use client";

import { type Article, type ArticleMetadata as ArticleMeta } from "~/types/article";
import { type Note } from "~/types/annotation";
import { useState, useRef, useEffect, useCallback } from "react";
import { ArticleReaderHeader } from "./article-reader-header";
import { ArticleMetadata } from "./article-metadata";
import { ArticleContent } from "./article-content";
import { StandaloneNotes } from "./standalone-notes";
import { cn } from "~/lib/utils";
import { AudioPlayer } from "./audio-player";
import { ArticleTableOfContents } from "./article-table-of-contents";
import { useArticleToc, useTocOpenPreference } from "~/hooks/use-article-toc";

interface ArticleReaderProps {
  article: Article;
  onMarkAsRead?: () => void;
  initialNotes?: Note[];
}

export function ArticleReader({
  article,
  onMarkAsRead,
  initialNotes = [],
}: ArticleReaderProps) {
  const [fontSize, setFontSize] = useState(19);
  const [showSettings, setShowSettings] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const markedAsReadRef = useRef<string | null>(null);
  const onMarkAsReadRef = useRef(onMarkAsRead);
  const lastScrollTopRef = useRef(0);
  const hideScrollAccumulatorRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [isPlayerVisible, setIsPlayerVisible] = useState(true);
  const isAudioPlayingRef = useRef(false);

  const handlePlayingChange = useCallback((playing: boolean) => {
    isAudioPlayingRef.current = playing;
    if (playing) {
      setIsPlayerVisible(true);
      hideScrollAccumulatorRef.current = 0;
    }
  }, []);

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

  const { isOpen: isTocOpen, close: closeToc, open: openToc } =
    useTocOpenPreference();
  const tocContentKey = `${article.id}:${fontSize}:${article.content.length}`;
  const { headings, activeId, scrollToHeading, hasToc } = useArticleToc({
    contentRef,
    scrollerRef,
    contentKey: tocContentKey,
  });

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

  useEffect(() => {
    lastScrollTopRef.current = 0;
    hideScrollAccumulatorRef.current = 0;
    isAudioPlayingRef.current = false;
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
        if (
          !isAudioPlayingRef.current &&
          hideScrollAccumulatorRef.current >= 48
        ) {
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
        {/* m-slide-in uses transform; keep fixed/absolute docks outside it (iOS Safari) */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden m-slide-in">
          <ArticleReaderHeader
            article={article}
            showSettings={showSettings}
            onToggleSettings={() => setShowSettings(!showSettings)}
            fontSize={fontSize}
            onFontSizeChange={setFontSize}
            hasToc={hasToc}
            isTocOpen={isTocOpen}
            onOpenToc={openToc}
          />

          <div className="h-[2px] bg-background-deep">
            <div
              className="h-full bg-accent transition-[width] duration-150 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div
            ref={scrollerRef}
            className="min-h-0 min-w-0 flex-1 scroll-pt-24 overflow-x-hidden overflow-y-auto px-5 pt-8 pb-36 sm:px-8 sm:pt-12 sm:pb-40"
          >
            <article className="mx-auto min-w-0 max-w-[640px]">
              <ArticleMetadata article={article} />

              {initialNotes.length > 0 && (
                <div className="mb-8 rounded-2xl border border-rule bg-surface p-4 shadow-[var(--shadow-soft)]">
                  <StandaloneNotes notes={initialNotes} />
                </div>
              )}

              <ArticleContent
                content={article.content}
                fontSize={fontSize}
                contentRef={contentRef}
              />
            </article>
          </div>
        </div>

        {hasToc && (
          <ArticleTableOfContents
            headings={headings}
            activeId={activeId}
            isOpen={isTocOpen}
            onClose={closeToc}
            onNavigate={scrollToHeading}
          />
        )}

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
              onJumpToReadingPosition={handleJumpToReadingPosition}
              onPlayingChange={handlePlayingChange}
            />
          </div>
        </div>
    </div>
  );
}
