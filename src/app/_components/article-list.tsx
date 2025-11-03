/**
 * Article List Component
 * Mobile-first responsive list of articles
 */

"use client";

import { type Article } from "~/types/article";
import { ArticleCard } from "./article-card";
import { SearchBar } from "./search-bar";
import { useState, useMemo } from "react";

interface ArticleListProps {
  articles: Article[];
  isLoading?: boolean;
  onArticleClick?: (article: Article) => void;
  onArchive?: (articleId: string) => void;
  onUnarchive?: (articleId: string) => void;
  onDelete?: (articleId: string) => void;
  onMoveToFolder?: (articleId: string, folderId: string | null) => void;
  showSearch?: boolean;
  showFilters?: boolean;
}

export function ArticleList({
  articles,
  isLoading = false,
  onArticleClick,
  onArchive,
  onUnarchive,
  onDelete,
  onMoveToFolder,
  showSearch = true,
  showFilters = false,
}: ArticleListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "title">("newest");

  // Filter and sort articles
  const filteredArticles = useMemo(() => {
    let filtered = articles;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (article) =>
          article.title.toLowerCase().includes(query) ||
          article.excerpt?.toLowerCase().includes(query) ||
          article.content.toLowerCase().includes(query) ||
          (article.tags &&
            article.tags.some((tag) => tag.toLowerCase().includes(query))),
      );
    }

    // Sort articles
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        case "oldest":
          return (
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        case "title":
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

    return filtered;
  }, [articles, searchQuery, sortBy]);

  if (isLoading) {
    return (
      <div className="w-full space-y-4 p-4">
        {/* Loading skeleton */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="mb-2 h-4 w-3/4 rounded bg-gray-700"></div>
            <div className="mb-1 h-3 w-full rounded bg-gray-700"></div>
            <div className="h-3 w-2/3 rounded bg-gray-700"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      {/* Search and filters */}
      {showSearch && (
        <div className="sticky top-0 z-10 space-y-3 border-b border-gray-700 bg-gray-800 p-4">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search articles..."
          />

          {showFilters && (
            <div className="flex flex-wrap gap-2 text-sm">
              {/* Sort filter */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="rounded-lg border border-gray-600 bg-gray-700 px-3 py-1 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="title">Title A-Z</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* Article count */}
      <div className="border-b border-gray-700 px-4 py-2 text-sm text-gray-400">
        {filteredArticles.length}{" "}
        {filteredArticles.length === 1 ? "article" : "articles"}
        {searchQuery && ` found for "${searchQuery}"`}
      </div>

      {/* Articles list */}
      <div className="flex-1 overflow-y-auto">
        {filteredArticles.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-700">
              <svg
                className="h-8 w-8 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-medium text-white">
              {searchQuery ? "No articles found" : "No articles yet"}
            </h3>
            <p className="max-w-sm text-gray-400">
              {searchQuery
                ? "Try adjusting your search terms or filters"
                : "Start by adding your first article to read later"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {filteredArticles.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                onClick={() => onArticleClick?.(article)}
                onArchive={() => onArchive?.(article.id)}
                onUnarchive={() => onUnarchive?.(article.id)}
                onDelete={() => onDelete?.(article.id)}
                onMoveToFolder={(folderId) =>
                  onMoveToFolder?.(article.id, folderId)
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
