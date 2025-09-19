/**
 * Article Card Component
 * Mobile-optimized card display for individual articles
 */

"use client";

import { type Article } from "~/types/article";
import { useState } from "react";

interface ArticleCardProps {
  article: Article;
  onClick?: () => void;
  onMarkAsRead?: () => void;
  onMarkAsUnread?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onMoveToFolder?: (folderId: string | null) => void;
  showActions?: boolean;
}

export function ArticleCard({
  article,
  onClick,
  onMarkAsRead,
  onMarkAsUnread,
  onArchive,
  onDelete,
  onMoveToFolder,
  showActions = true,
}: ArticleCardProps) {
  const [showMenu, setShowMenu] = useState(false);

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
    <div className="relative bg-white transition-colors hover:bg-gray-50">
      {/* Main content area - clickable */}
      <div className="cursor-pointer p-4" onClick={onClick}>
        {/* Header with metadata */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs text-gray-500">
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
            {article.isRead && (
              <div className="h-2 w-2 rounded-full bg-green-400" title="Read" />
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
        <h3 className="mb-2 line-clamp-2 text-base leading-tight font-medium text-gray-900">
          {article.title}
        </h3>

        {/* Excerpt */}
        {article.excerpt && (
          <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-gray-600">
            {article.excerpt}
          </p>
        )}

        {/* Footer with tags and author */}
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center space-x-2">
            {/* Author */}
            {article.author && (
              <span className="truncate text-xs text-gray-500">
                by {article.author}
              </span>
            )}

            {/* Tags */}
            {article.tags && article.tags.length > 0 && (
              <div className="flex items-center space-x-1">
                {article.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
                  >
                    {tag}
                  </span>
                ))}
                {article.tags.length > 2 && (
                  <span className="text-xs text-gray-400">
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
                className="rounded p-1 transition-colors hover:bg-gray-200"
                aria-label="Article actions"
              >
                <svg
                  className="h-4 w-4 text-gray-500"
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
                  <div className="absolute top-full right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                    {!article.isRead ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkAsRead?.();
                          setShowMenu(false);
                        }}
                        className="flex w-full items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
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
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        Mark as Read
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkAsUnread?.();
                          setShowMenu(false);
                        }}
                        className="flex w-full items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
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
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                        Mark as Unread
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(article.url, "_blank");
                        setShowMenu(false);
                      }}
                      className="flex w-full items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
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
                        onArchive?.();
                        setShowMenu(false);
                      }}
                      className="flex w-full items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
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
                      className="flex w-full items-center px-3 py-2 text-sm text-red-600 hover:bg-red-50"
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
