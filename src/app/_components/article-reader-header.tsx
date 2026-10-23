/**
 * Article Reader Header Component
 * Matter-inspired header with compact reading controls
 */

"use client";

import { type MouseEvent } from "react";
import Link from "next/link";
import { type Article } from "~/types/article";
import { ReadingSettings } from "./reading-settings";
import { Button } from "~/components/ui/button";
import { Settings, ArrowLeft, List, BookOpen, Globe } from "lucide-react";
import { type ArticleViewMode } from "~/lib/article-web-view";
import { api } from "~/trpc/react";
import { useRouter } from "next/navigation";
import { getReturnToLabel, sanitizeReturnTo } from "~/lib/article-navigation";
import { withViewTransition } from "~/lib/with-view-transition";
import { ParaToggle } from "./para-toggle";
import { ArticleActionsMenu } from "./article-actions-menu";
import { useDeleteArticle } from "../_hooks/use-delete-article";
import { cn } from "~/lib/utils";
import {
  hasExtractedText,
  isPdfArticle,
  DOCUMENT_UNSUPPORTED_PARA_MESSAGE,
} from "~/lib/article-content-kind";

interface ArticleReaderHeaderProps {
  article: Article;
  showSettings: boolean;
  onToggleSettings: () => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  hasToc?: boolean;
  isTocOpen?: boolean;
  onOpenToc?: () => void;
  returnTo?: string;
  viewMode?: ArticleViewMode;
  onViewModeChange?: (mode: ArticleViewMode) => void;
}

export function ArticleReaderHeader({
  article,
  showSettings,
  onToggleSettings,
  fontSize,
  onFontSizeChange,
  hasToc = false,
  isTocOpen = false,
  onOpenToc,
  returnTo: returnToProp,
  viewMode = "reader",
  onViewModeChange,
}: ArticleReaderHeaderProps) {
  const returnTo = sanitizeReturnTo(returnToProp ?? null);
  const utils = api.useUtils();
  const router = useRouter();
  const { mutate: archive } = api.article.archive.useMutation({
    onSuccess: () => {
      void utils.article.get.invalidate({ id: article.id });
      void utils.article.getAll.invalidate();
      void utils.article.getArchived.invalidate();
    },
  });
  const { mutate: unarchive } = api.article.unarchive.useMutation({
    onSuccess: () => {
      void utils.article.get.invalidate({ id: article.id });
      void utils.article.getAll.invalidate();
      void utils.article.getArchived.invalidate();
    },
  });
  const { mutate: deleteArticle } = useDeleteArticle({
    // Navigate the instant the article is removed from the cache, rather than
    // waiting for the server round-trip to finish.
    onOptimisticDelete: () => {
      withViewTransition(() => {
        router.push(returnTo);
      });
    },
  });

  const handleBackClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;

    e.preventDefault();
    withViewTransition(() => {
      router.push(returnTo);
    });
  };

  const domain = (() => {
    try {
      return new URL(article.url).hostname.replace("www.", "");
    } catch {
      return article.url;
    }
  })();

  const isPdfWithoutText = isPdfArticle(article) && !hasExtractedText(article);

  const readingTime = isPdfWithoutText
    ? "PDF"
    : article.readingTime
      ? `${article.readingTime} min`
      : "Saved";

  return (
    <div className="bg-background/90 border-rule sticky top-0 z-20 border-b backdrop-blur-xl">
      <div className="flex items-center justify-between gap-1 px-3 py-2 sm:px-8 sm:py-3">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="text-foreground-soft hover:bg-foreground/10 hover:text-foreground h-10 shrink-0 rounded-full px-2.5 text-sm sm:h-9"
        >
          <Link
            href={returnTo}
            onClick={handleBackClick}
            aria-label={getReturnToLabel(returnTo)}
          >
            <ArrowLeft className="h-4 w-4 sm:mr-1.5" aria-hidden />
            <span className="hidden sm:inline">Close</span>
          </Link>
        </Button>

        <div className="text-muted-foreground min-w-0 flex-1 px-1 text-center text-xs sm:px-3">
          <div className="flex min-w-0 items-center justify-center gap-1.5 truncate sm:gap-2">
            <span
              className="bg-accent text-accent-foreground inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] text-[9px] font-bold"
              aria-hidden
            >
              {domain.charAt(0).toUpperCase()}
            </span>
            <span className="truncate">{domain}</span>
            <span aria-hidden>·</span>
            <span className="shrink-0">{readingTime}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {viewMode === "reader" && hasToc && !isTocOpen && onOpenToc && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenToc}
              className="text-foreground-soft hover:bg-foreground/10 hover:text-foreground hidden h-10 w-10 rounded-full lg:inline-flex"
              aria-label="Show table of contents"
            >
              <List className="h-4 w-4" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSettings}
            className={cn(
              "h-10 w-10 rounded-full sm:h-8 sm:w-8",
              showSettings
                ? "bg-background-deep text-foreground"
                : "text-foreground-soft hover:bg-foreground/10 hover:text-foreground",
            )}
            aria-label="Reading settings"
            disabled={viewMode === "web"}
          >
            <Settings className="h-4 w-4" />
          </Button>

          <ArticleActionsMenu
            article={article}
            alwaysVisible
            showShare
            onArchive={() => archive({ id: article.id })}
            onUnarchive={() => unarchive({ id: article.id })}
            onDelete={() => deleteArticle({ id: article.id })}
            className="text-foreground-soft hover:bg-foreground/10 hover:text-foreground"
          />
        </div>
      </div>

      {onViewModeChange && (
        <div className="flex justify-center px-4 pb-2 sm:pb-3">
          <div
            role="group"
            aria-label="Article view"
            className="bg-background-deep border-rule inline-flex gap-1 rounded-full border p-1"
          >
            {(
              [
                ["reader", "Reader", BookOpen],
                ["web", "Web", Globe],
              ] as const
            ).map(([mode, label, Icon]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={viewMode === mode}
                onClick={() => onViewModeChange(mode)}
                className={cn(
                  "focus-visible:ring-accent inline-flex min-h-9 items-center gap-1.5 rounded-full px-5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
                  viewMode === mode
                    ? "bg-surface text-foreground shadow-[var(--shadow-soft)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {viewMode === "reader" && showSettings && (
        <div className="border-rule border-t px-4 py-3 sm:px-8">
          <div className="border-rule bg-surface flex flex-col gap-3 rounded-2xl border p-3 shadow-[var(--shadow-soft)]">
            <ReadingSettings
              fontSize={fontSize}
              onFontSizeChange={onFontSizeChange}
            />

            <div className="border-rule border-t pt-3">
              <ParaToggle
                articleId={article.id}
                articleTitle={article.title}
                className="px-1 py-2"
                disabled={isPdfWithoutText}
                disabledReason={DOCUMENT_UNSUPPORTED_PARA_MESSAGE}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
