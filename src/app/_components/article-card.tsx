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

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return "Just now";
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else if (diffInHours < 168) {
      // 7 days
      return `${Math.floor(diffInHours / 24)}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const formatReadingTime = (minutes: number) => {
    if (minutes < 1) return "< 1 min read";
    return `${minutes} min read`;
  };

  const getDomainFromUrl = (url: string) => {
    try {
      return new URL(url).hostname.replace("www.", "");
    } catch {
      return url;
    }
  };

  return (
    <div className="bg-card hover:bg-muted relative transition-colors">
      {/* Main content area - clickable */}
      <div className="cursor-pointer p-4" onClick={onClick}>
        {/* Header with metadata */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs text-gray-400">
            <span>{getDomainFromUrl(article.url)}</span>
            <span>•</span>
            <span>{formatDate(article.createdAt)}</span>
            {article.readingTime && (
              <>
                <span>•</span>
                <span>{formatReadingTime(article.readingTime)}</span>
              </>
            )}
          </div>

          {/* Status indicators */}
          <div className="flex items-center space-x-1">
            {listenProgress !== undefined && (
              <ListenProgress progress={listenProgress} size={20} />
            )}
            {article.isArchived && (
              <div
                className="h-2 w-2 rounded-full bg-gray-400"
                title="Archived"
              />
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="mb-2 line-clamp-2 text-base leading-tight font-medium text-white">
          {article.title}
        </h3>

        {/* Excerpt */}
        {article.excerpt && (
          <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-gray-300">
            {article.excerpt}
          </p>
        )}

        {/* Footer with tags and author */}
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center space-x-2">
            {/* Author */}
            {article.author && (
              <span className="truncate text-xs text-gray-400">
                by {article.author}
              </span>
            )}

            {/* Tags */}
            {article.tags && article.tags.length > 0 && (
              <div className="flex items-center space-x-1">
                {article.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded bg-blue-700 px-2 py-0.5 text-xs font-medium text-blue-200"
                  >
                    {tag}
                  </span>
                ))}
                {article.tags.length > 2 && (
                  <span className="text-xs text-gray-500">
                    +{article.tags.length - 2}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Actions menu */}
          {showActions && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-2 h-7 w-7 text-gray-400 hover:bg-gray-700 hover:text-white"
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
