/**
 * Article Card Component
 * Mobile-optimized card display for individual articles
 */

"use client";

import { type Article } from "~/types/article";
import { useContext, useState } from "react";
import { GeneralContext } from "../(protected)/contexts/general-context";
import { ListenProgress } from "./listen-progress";

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
  onMoveToFolder,
  showActions = true,
  listenProgress,
}: ArticleCardProps) {
  const [showMenu, setShowMenu] = useState(false);
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
    <div className="relative bg-gray-800 transition-colors hover:bg-gray-700">
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
            <div className="relative ml-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className="rounded p-1 transition-colors hover:bg-gray-700"
                aria-label="Article actions"
              >
                <svg
                  className="h-4 w-4 text-gray-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>

              {/* Dropdown menu */}
              {showMenu && (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowMenu(false)}
                  />

                  {/* Menu */}
                  <div className="absolute top-full right-0 z-20 mt-1 w-48 rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-lg">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(article.url, "_blank");
                        setShowMenu(false);
                      }}
                      className="flex w-full items-center px-3 py-2 text-sm text-gray-300 hover:bg-gray-700"
                    >
                      <svg
                        className="mr-2 h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                      Open Original
                    </button>

                    <hr className="my-1" />

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMetadataEditArticle({
                          id: article.id,
                          title: article.title,
                          url: article.url,
                        });
                        setShowMenu(false);
                      }}
                      className="flex w-full items-center px-3 py-2 text-sm text-gray-300 hover:bg-gray-700"
                    >
                      <svg
                        className="mr-2 h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4v4m0 0H8m4-4h4m-8 8h8m-8 4h8"
                        />
                      </svg>
                      Edit metadata
                    </button>

                    {article.isArchived ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onUnarchive?.();
                          setShowMenu(false);
                        }}
                        className="flex w-full items-center px-3 py-2 text-sm text-gray-300 hover:bg-gray-700"
                      >
                        <svg
                          className="mr-2 h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 8l6 6 6-6"
                          />
                        </svg>
                        Unarchive
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onArchive?.();
                          setShowMenu(false);
                        }}
                        className="flex w-full items-center px-3 py-2 text-sm text-gray-300 hover:bg-gray-700"
                      >
                        <svg
                          className="mr-2 h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 8l6 6 6-6"
                          />
                        </svg>
                        Archive
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (
                          confirm(
                            "Are you sure you want to delete this article?",
                          )
                        ) {
                          onDelete?.();
                        }
                        setShowMenu(false);
                      }}
                      className="flex w-full items-center px-3 py-2 text-sm text-red-400 hover:bg-red-900"
                    >
                      <svg
                        className="mr-2 h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
