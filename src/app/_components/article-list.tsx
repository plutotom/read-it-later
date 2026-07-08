/**
 * Article List Component
 * Mobile-first responsive list of articles
 */

"use client";

import { type Article } from "~/types/article";
import { ArticleCard } from "./article-card";
import { ArticleActionsMenu } from "./article-actions-menu";
import { ParaBadge } from "./para-badge";
import { PdfBadge } from "./pdf-badge";
import { SearchBar } from "./search-bar";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { truncateText } from "~/lib/text-utils";
import { api } from "~/trpc/react";
import { isPdfArticle } from "~/lib/article-content-kind";

const HERO_TITLE_MAX_CHARS = 100;
const HERO_EXCERPT_MAX_CHARS = 180;

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
  const listArticles = heroArticle
    ? filteredArticles.slice(1)
    : filteredArticles;
  const visibleArticles = listArticles.slice(0, visibleCount);
  const remainingCount = Math.max(
    0,
    listArticles.length - visibleArticles.length,
  );

  const articleIds = useMemo(
    () => filteredArticles.map((article) => article.id),
    [filteredArticles],
  );

  const { data: paraStatuses = {} } = api.para.getArticleStatuses.useQuery(
    { articleIds },
    { enabled: articleIds.length > 0 },
  );

  const router = useRouter();
  const prefetchedRef = useRef(new Set<string>());
  const prefetchArticle = (articleId: string) => {
    if (prefetchedRef.current.has(articleId)) return;
    prefetchedRef.current.add(articleId);
    router.prefetch(`/article/${articleId}`);
  };

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
            className="border-rule bg-surface animate-pulse rounded-2xl border px-5 py-5"
          >
            <div className="bg-background-deep mb-3 h-5 w-3/4 rounded"></div>
            <div className="bg-background-deep mb-2 h-3 w-full rounded"></div>
            <div className="bg-background-deep h-3 w-2/3 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-4">
      {showSearch && (
        <div className="border-rule bg-background/90 sticky top-14 z-20 -mx-4 border-b px-4 py-3 backdrop-blur-xl sm:top-14 sm:mx-0 sm:rounded-t-2xl">
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
                className="border-rule bg-surface text-foreground focus:ring-ring/30 rounded-full border px-3 py-1.5 text-sm transition outline-none focus:ring-2"
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
          <div className="border-rule bg-surface flex h-full flex-col items-center justify-center rounded-2xl border p-8 text-center">
            <div className="bg-background-deep mb-4 flex h-16 w-16 items-center justify-center rounded-full">
              <svg
                className="text-muted-foreground h-8 w-8"
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
              className="text-foreground mb-2 text-2xl font-medium tracking-tight"
              style={{ fontFamily: "var(--font-app-display)" }}
            >
              {searchQuery ? "No articles found" : "No articles yet"}
            </h3>
            <p className="text-foreground-soft max-w-sm text-sm leading-relaxed">
              {searchQuery
                ? "Try adjusting your search terms or filters"
                : "Start by adding your first article to read later"}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {heroArticle && (
              <div className="group border-rule bg-surface hover:shadow-soft relative overflow-hidden rounded-2xl border transition hover:-translate-y-0.5">
                <button
                  type="button"
                  onClick={() => onArticleClick?.(heroArticle)}
                  onPointerEnter={() => prefetchArticle(heroArticle.id)}
                  onFocus={() => prefetchArticle(heroArticle.id)}
                  className="grid w-full text-left"
                >
                  <div className="grid min-h-[240px] grid-cols-1 sm:grid-cols-[1.2fr_0.8fr]">
                    <div className="p-5 sm:p-7">
                      <div className="text-muted-foreground text-xs tracking-[0.18em] uppercase">
                        Continue reading
                      </div>
                      <h2
                        className="text-foreground mt-3 line-clamp-3 text-3xl leading-[1.05] font-medium tracking-tight break-words sm:text-4xl"
                        style={{ fontFamily: "var(--font-app-display)" }}
                      >
                        {truncateText(heroArticle.title, HERO_TITLE_MAX_CHARS)}
                      </h2>
                      {heroArticle.excerpt && (
                        <p className="text-foreground-soft mt-3 line-clamp-4 max-w-xl text-[15px] leading-relaxed break-words">
                          {truncateText(
                            heroArticle.excerpt,
                            HERO_EXCERPT_MAX_CHARS,
                          )}
                        </p>
                      )}
                      <div className="text-muted-foreground mt-5 flex flex-wrap items-center gap-2 text-xs">
                        <span>{getDomainFromUrl(heroArticle.url)}</span>
                        {heroArticle.readingTime && (
                          <>
                            <span>·</span>
                            <span>{heroArticle.readingTime} min</span>
                          </>
                        )}
                        {isPdfArticle(heroArticle) && <PdfBadge size="md" />}
                        {paraStatuses[heroArticle.id] && (
                          <ParaBadge size="md" />
                        )}
                      </div>
                      <div className="bg-background-deep mt-6 h-[3px] overflow-hidden rounded-full">
                        <div
                          className="m-progress-fill bg-accent h-full rounded-full"
                          style={{ "--p": "46%" } as CSSProperties}
                        />
                      </div>
                    </div>
                    <div className="relative min-h-[180px] bg-[radial-gradient(120%_120%_at_20%_10%,var(--highlight-peach)_0%,var(--accent)_58%,color-mix(in_oklch,var(--foreground)_82%,var(--accent))_100%)]">
                      <div className="absolute inset-5 rounded-[1.25rem] border border-white/20 bg-white/10 backdrop-blur-md dark:border-white/10 dark:bg-black/10" />
                    </div>
                  </div>
                </button>
                <div className="absolute top-3 right-3 z-10 sm:top-4 sm:right-4">
                  <ArticleActionsMenu
                    article={heroArticle}
                    isOnPara={paraStatuses[heroArticle.id] ?? false}
                    onArchive={() => onArchive?.(heroArticle.id)}
                    onUnarchive={() => onUnarchive?.(heroArticle.id)}
                    onDelete={() => onDelete?.(heroArticle.id)}
                    alwaysVisible
                    className="bg-surface/80 text-foreground hover:bg-surface backdrop-blur-sm"
                  />
                </div>
              </div>
            )}

            <div className="border-rule bg-surface overflow-hidden rounded-2xl border">
              <div className="divide-rule divide-y">
                {visibleArticles.map((article) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    isOnPara={paraStatuses[article.id] ?? false}
                    onClick={() => onArticleClick?.(article)}
                    onPrefetch={() => prefetchArticle(article.id)}
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
                  className="border-rule bg-surface text-foreground-soft shadow-soft hover:bg-background-deep hover:text-foreground rounded-full border px-4 py-2 text-sm font-medium transition hover:-translate-y-0.5"
                  style={{ fontFamily: "var(--font-app-sans)" }}
                >
                  Load 10 more
                  <span className="text-muted-foreground ml-2 text-xs">
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
