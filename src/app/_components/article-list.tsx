/**
 * Article List Component
 * Mobile-first responsive list of articles
 */

"use client";

import { type Article } from "~/types/article";
import { ArticleCard } from "./article-card";
import { SearchBar } from "./search-bar";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

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
  const PAGE_SIZE = 10;
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "title">("newest");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filteredArticles = useMemo(() => {
    let filtered = [...articles];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (article) =>
          article.title.toLowerCase().includes(query) ||
          (article.excerpt?.toLowerCase().includes(query) ?? false) ||
          article.content.toLowerCase().includes(query) ||
          article.tags?.some((tag) => tag.toLowerCase().includes(query)),
      );
    }

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

  const heroArticle =
    searchQuery.trim().length === 0 && filteredArticles.length > 0
      ? filteredArticles[0]
      : null;
  const listArticles = heroArticle ? filteredArticles.slice(1) : filteredArticles;
  const visibleArticles = listArticles.slice(0, visibleCount);
  const remainingCount = Math.max(0, listArticles.length - visibleArticles.length);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, sortBy, filteredArticles.length]);

  const getDomainFromUrl = (url: string) => {
    try {
      return new URL(url).hostname.replace("www.", "");
    } catch {
      return url;
    }
  };

  if (isLoading) {
    return (
      <div className="w-full space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-2xl border border-rule bg-surface px-5 py-5"
          >
            <div className="mb-3 h-5 w-3/4 rounded bg-background-deep"></div>
            <div className="mb-2 h-3 w-full rounded bg-background-deep"></div>
            <div className="h-3 w-2/3 rounded bg-background-deep"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-4">
      {showSearch && (
        <div className="sticky top-14 z-20 -mx-4 border-b border-rule bg-background/90 px-4 py-3 backdrop-blur-xl sm:top-14 sm:mx-0 sm:rounded-t-2xl">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search"
          />

          {showFilters && (
            <div className="flex flex-wrap gap-2 text-sm">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="rounded-full border border-rule bg-surface px-3 py-1.5 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/30"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="title">Title A-Z</option>
              </select>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto pb-8">
        {filteredArticles.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-rule bg-surface p-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-background-deep">
              <svg
                className="h-8 w-8 text-muted-foreground"
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
            <h3
              className="mb-2 text-2xl font-medium tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-app-display)" }}
            >
              {searchQuery ? "No articles found" : "No articles yet"}
            </h3>
            <p className="max-w-sm text-sm leading-relaxed text-foreground-soft">
              {searchQuery
                ? "Try adjusting your search terms or filters"
                : "Start by adding your first article to read later"}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {heroArticle && (
              <button
                type="button"
                onClick={() => onArticleClick?.(heroArticle)}
                className="group grid w-full overflow-hidden rounded-2xl border border-rule bg-surface text-left transition hover:-translate-y-0.5 hover:shadow-soft"
              >
                <div className="grid min-h-[240px] grid-cols-1 sm:grid-cols-[1.2fr_0.8fr]">
                  <div className="p-5 sm:p-7">
                    <div className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
                      Continue reading
                    </div>
                    <h2
                      className="mt-3 text-3xl leading-[1.05] font-medium tracking-tight text-foreground sm:text-4xl"
                      style={{ fontFamily: "var(--font-app-display)" }}
                    >
                      {heroArticle.title}
                    </h2>
                    {heroArticle.excerpt && (
                      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-foreground-soft">
                        {heroArticle.excerpt}
                      </p>
                    )}
                    <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{getDomainFromUrl(heroArticle.url)}</span>
                      {heroArticle.readingTime && (
                        <>
                          <span>·</span>
                          <span>{heroArticle.readingTime} min</span>
                        </>
                      )}
                    </div>
                    <div className="mt-6 h-[3px] overflow-hidden rounded-full bg-background-deep">
                      <div
                        className="m-progress-fill h-full rounded-full bg-accent"
                        style={{ "--p": "46%" } as CSSProperties}
                      />
                    </div>
                  </div>
                  <div className="relative min-h-[180px] bg-[radial-gradient(120%_120%_at_20%_10%,var(--highlight-peach)_0%,var(--accent)_58%,color-mix(in_oklch,var(--foreground)_82%,var(--accent))_100%)]">
                    <div className="absolute inset-5 rounded-[1.25rem] border border-white/20 bg-white/10 backdrop-blur-md dark:border-white/10 dark:bg-black/10" />
                  </div>
                </div>
              </button>
            )}

            <div className="overflow-hidden rounded-2xl border border-rule bg-surface">
              <div className="divide-y divide-rule">
                {visibleArticles.map((article) => (
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
            </div>

            {remainingCount > 0 && (
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                  className="rounded-full border border-rule bg-surface px-4 py-2 text-sm font-medium text-foreground-soft shadow-soft transition hover:-translate-y-0.5 hover:bg-background-deep hover:text-foreground"
                  style={{ fontFamily: "var(--font-app-sans)" }}
                >
                  Load 10 more
                  <span className="ml-2 text-xs text-muted-foreground">
                    {remainingCount} left
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
