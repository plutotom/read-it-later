"use client";

import { type Article } from "~/types/article";
import { ListenProgress } from "./listen-progress";
import { ArticleActionsMenu } from "./article-actions-menu";
import { ParaBadge } from "./para-badge";

interface ArticleCardProps {
  article: Article;
  onClick?: () => void;
  onPrefetch?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete?: () => void;
  onMoveToFolder?: (folderId: string | null) => void;
  showActions?: boolean;
  isOnPara?: boolean;
  /** Listen progress as a fraction (0-1), undefined if no audio */
  listenProgress?: number;
}

export function ArticleCard({
  article,
  onClick,
  onPrefetch,
  onArchive,
  onUnarchive,
  onDelete,
  onMoveToFolder: _onMoveToFolder,
  showActions = true,
  isOnPara = false,
  listenProgress,
}: ArticleCardProps) {
  const formatReadingTime = (minutes: number) => {
    if (minutes < 1) return "< 1 min";
    return `${minutes} min`;
  };

  const getDomainFromUrl = (url: string) => {
    try {
      return new URL(url).hostname.replace("www.", "");
    } catch {
      return url;
    }
  };

  const domain = getDomainFromUrl(article.url);
  const initial = domain.charAt(0).toUpperCase();
  const faviconPalette = [
    "var(--accent)",
    "oklch(0.68 0.12 150)",
    "oklch(0.7 0.09 240)",
    "oklch(0.79 0.11 80)",
    "oklch(0.63 0.1 330)",
  ];
  const faviconHue = faviconPalette[domain.length % faviconPalette.length];

  return (
    <div className="group relative">
      <div
        className="flex cursor-pointer items-start gap-4 px-4 py-4 transition-colors duration-200 hover:bg-foreground/10 sm:px-6 sm:py-5"
        onClick={onClick}
        onPointerEnter={onPrefetch}
        onFocus={onPrefetch}
      >
        <div className="mt-0.5 flex items-center gap-3">
          <span
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] text-[9px] font-bold text-white"
            style={{ background: faviconHue }}
          >
            {initial}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div
            className="line-clamp-2 text-[17px] leading-snug tracking-tight text-foreground"
            style={{
              fontFamily: "var(--font-app-display)",
              fontWeight: 500,
            }}
          >
            {article.title}
          </div>

          {article.excerpt && (
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-foreground-soft">
              {article.excerpt}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span>{domain}</span>
            {article.readingTime && (
              <>
                <span>·</span>
                <span>{formatReadingTime(article.readingTime)}</span>
              </>
            )}
            {isOnPara && <ParaBadge />}
            {listenProgress !== undefined && (
              <>
                <span>·</span>
                <ListenProgress progress={listenProgress} size={16} />
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-start">
          {showActions && (
            <ArticleActionsMenu
              article={article}
              isOnPara={isOnPara}
              onArchive={onArchive}
              onUnarchive={onUnarchive}
              onDelete={onDelete}
            />
          )}
        </div>
      </div>
    </div>
  );
}
