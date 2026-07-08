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
import { PdfViewer } from "./pdf-viewer-dynamic";
import { AudioPlayer } from "./audio-player";
import { cn } from "~/lib/utils";
import {
  documentNeedsExtractionWarning,
  isPdfArticle,
} from "~/lib/article-content-kind";
import { DocumentExtractionBanner } from "./document-extraction-banner";
import { ArticleTableOfContents } from "./article-table-of-contents";
import { useArticleToc, useTocOpenPreference } from "~/hooks/use-article-toc";

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
  const [pdfProgress, setPdfProgress] = useState(0);
  const [isPlayerVisible, setIsPlayerVisible] = useState(true);
  const isAudioPlayingRef = useRef(false);

  const handlePlayingChange = useCallback((playing: boolean) => {
    isAudioPlayingRef.current = playing;
    if (playing) {
      setIsPlayerVisible(true);
      hideScrollAccumulatorRef.current = 0;
    }
  }, []);
  const {
    isOpen: isTocOpen,
    close: closeToc,
    open: openToc,
  } = useTocOpenPreference();
  const tocContentKey = `${article.id}:${DEFAULT_FONT_SIZE}:${article.content.length}`;
  const { headings, activeId, scrollToHeading, hasToc } = useArticleToc({
    contentRef,
    scrollerRef,
    contentKey: tocContentKey,
  });

  const articleImageUrl = (() => {
    const meta = article.metadata as ArticleMeta | null | undefined;
    return meta?.imageUrl ?? null;
  })();
  const isPdf = isPdfArticle(article);
  const showExtractionWarning =
    isPdf && documentNeedsExtractionWarning(article);

  const handleJumpToReadingPosition = useCallback((progressRatio: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const maxScroll = scroller.scrollHeight - scroller.clientHeight;
    if (maxScroll <= 0) return;
    scroller.scrollTo({
      top: maxScroll * Math.min(1, Math.max(0, progressRatio)),
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    lastScrollTopRef.current = 0;
    hideScrollAccumulatorRef.current = 0;
    isAudioPlayingRef.current = false;
    setIsPlayerVisible(true);
    setPdfProgress(0);
  }, [article.id]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || isPdf) return;

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
  }, [article.id, isPdf]);

  const readingProgress = isPdf ? pdfProgress : progress;

  return (
    <div className="bg-background relative flex h-dvh max-h-dvh w-full flex-col overflow-hidden pt-[env(safe-area-inset-top,0px)]">
      <div className="m-slide-in flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <PublicArticleReaderHeader
          article={article}
          hasToc={hasToc}
          isTocOpen={isTocOpen}
          onOpenToc={openToc}
        />

        <div className="bg-background-deep h-[2px]">
          <div
            className="bg-accent h-full transition-[width] duration-150 ease-out"
            style={{ width: `${readingProgress}%` }}
          />
        </div>

        <div
          ref={isPdf ? undefined : scrollerRef}
          className={cn(
            "min-h-0 min-w-0 flex-1 pt-8 pb-36 sm:pt-12 sm:pb-40",
            isPdf
              ? "flex flex-col overflow-hidden px-3 sm:px-6"
              : "scroll-pt-24 overflow-x-hidden overflow-y-auto px-5 sm:px-8",
          )}
        >
          <article
            className={cn(
              "mx-auto w-full min-w-0",
              isPdf
                ? "flex min-h-0 max-w-7xl flex-1 flex-col"
                : "max-w-[640px]",
            )}
          >
            {isPdf ? (
              <PdfViewer
                className="min-h-0 flex-1"
                streamUrl={`/api/documents/${article.id}/stream?shareToken=${encodeURIComponent(shareToken)}`}
                originalUrl={article.url}
                title={article.title}
                extractedText={article.content}
                readingPositionKey={article.id}
                onProgressChange={setPdfProgress}
                header={
                  <>
                    {showExtractionWarning && (
                      <DocumentExtractionBanner
                        article={article}
                        showRetry={false}
                      />
                    )}
                    <ArticleMetadata article={article} />
                  </>
                }
              />
            ) : (
              <>
                <ArticleMetadata article={article} />
                <ArticleContent
                  content={article.content}
                  fontSize={DEFAULT_FONT_SIZE}
                  contentRef={contentRef}
                />
              </>
            )}
          </article>
        </div>
      </div>

      {hasToc && !isPdf && (
        <ArticleTableOfContents
          headings={headings}
          activeId={activeId}
          isOpen={isTocOpen}
          onClose={closeToc}
          onNavigate={scrollToHeading}
        />
      )}

      {!isPdf && (
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
              onPlayingChange={handlePlayingChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}
