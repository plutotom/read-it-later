/**
 * Article Card Component
 * Mobile-optimized card display for individual articles
 */

"use client";

import { type Article } from "~/types/article";
import { useContext } from "react";
import { GeneralContext } from "../(protected)/contexts/general-context";
import { ListenProgress } from "./listen-progress";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  MoreVertical,
  ExternalLink,
  Pencil,
  Archive,
  Trash2,
} from "lucide-react";

interface ArticleCardProps {
  article: Article;
  onClick?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete?: () => void;
  onMoveToFolder?: (folderId: string | null) => void;
  showActions?: boolean;
  /** Listen progress as a fraction (0-1), undefined if no audio */
  listenProgress?: number;
}

export function ArticleCard({
  article,
  onClick,
  onArchive,
  onUnarchive,
  onDelete,
  onMoveToFolder: _onMoveToFolder,
  showActions = true,
  listenProgress,
}: ArticleCardProps) {
  const { setMetadataEditArticle } = useContext(GeneralContext);

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

          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{domain}</span>
            {article.readingTime && (
              <>
                <span>·</span>
                <span>{formatReadingTime(article.readingTime)}</span>
              </>
            )}
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-muted-foreground opacity-0 transition hover:bg-foreground/10 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Article actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(article.url, "_blank");
                  }}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Original
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setMetadataEditArticle({
                      id: article.id,
                      title: article.title,
                      url: article.url,
                    });
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit metadata
                </DropdownMenuItem>

                {article.isArchived ? (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnarchive?.();
                    }}
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    Unarchive
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onArchive?.();
                    }}
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    Archive
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      confirm("Are you sure you want to delete this article?")
                    ) {
                      onDelete?.();
                    }
                  }}
                  className="text-red-400 focus:bg-red-900/30 focus:text-red-400"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}
