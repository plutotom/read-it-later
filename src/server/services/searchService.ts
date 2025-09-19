/**
 * Search service
 * Provides advanced search functionality for articles
 */

import type { Article } from "~/types/article";
import type { SearchResponse } from "~/types/api";

export interface SearchOptions {
  query: string;
  filters?: {
    folderId?: string;
    isRead?: boolean;
    isArchived?: boolean;
    tags?: string[];
    dateRange?: {
      start: Date;
      end: Date;
    };
    author?: string;
    siteName?: string;
  };
  sort?: {
    field: keyof Article;
    order: "asc" | "desc";
  };
  pagination?: {
    offset: number;
    limit: number;
  };
}

export class SearchService {
  /**
   * Perform full-text search on articles
   */
  static async searchArticles(
    articles: Article[],
    options: SearchOptions,
  ): Promise<SearchResponse<Article>> {
    const { query, filters = {}, sort, pagination } = options;

    // Filter articles based on query and filters
    let filteredArticles = articles.filter(
      (article) =>
        this.matchesQuery(article, query) &&
        this.matchesFilters(article, filters),
    );

    // Sort results
    if (sort) {
      filteredArticles = this.sortArticles(filteredArticles, sort);
    } else {
      // Default sort by relevance score
      filteredArticles = this.sortByRelevance(filteredArticles, query);
    }

    // Apply pagination
    const totalCount = filteredArticles.length;
    if (pagination) {
      const { offset, limit } = pagination;
      filteredArticles = filteredArticles.slice(offset, offset + limit);
    }

    // Generate search suggestions and facets
    const suggestions = this.generateSuggestions(query, articles);
    const facets = this.generateFacets(articles, filters);

    return {
      results: filteredArticles,
      totalCount,
      suggestions,
      facets,
    };
  }

  /**
   * Check if article matches search query
   */
  private static matchesQuery(article: Article, query: string): boolean {
    if (!query.trim()) return true;

    const searchTerms = query.toLowerCase().split(/\s+/);
    const searchableText = [
      article.title,
      article.content,
      article.excerpt || "",
      article.author || "",
      ...(article.tags || []),
      (article.metadata as any)?.siteName || "",
      (article.metadata as any)?.description || "",
    ]
      .join(" ")
      .toLowerCase();

    return searchTerms.every((term) => searchableText.includes(term));
  }

  /**
   * Check if article matches filters
   */
  private static matchesFilters(
    article: Article,
    filters: SearchOptions["filters"] = {},
  ): boolean {
    // Folder filter
    if (filters.folderId !== undefined) {
      if (filters.folderId === null && article.folderId !== null) return false;
      if (filters.folderId !== null && article.folderId !== filters.folderId)
        return false;
    }

    // Read status filter
    if (filters.isRead !== undefined && article.isRead !== filters.isRead) {
      return false;
    }

    // Archive status filter
    if (
      filters.isArchived !== undefined &&
      article.isArchived !== filters.isArchived
    ) {
      return false;
    }

    // Tags filter
    if (filters.tags && filters.tags.length > 0) {
      const articleTags = article.tags || [];
      const hasMatchingTag = filters.tags.some((tag) =>
        articleTags.some((articleTag) =>
          articleTag.toLowerCase().includes(tag.toLowerCase()),
        ),
      );
      if (!hasMatchingTag) return false;
    }

    // Date range filter
    if (filters.dateRange) {
      const articleDate = article.createdAt;
      if (
        articleDate < filters.dateRange.start ||
        articleDate > filters.dateRange.end
      ) {
        return false;
      }
    }

    // Author filter
    if (filters.author && article.author) {
      if (
        !article.author.toLowerCase().includes(filters.author.toLowerCase())
      ) {
        return false;
      }
    }

    // Site name filter
    if (filters.siteName && (article.metadata as any)?.siteName) {
      if (
        !(article.metadata as any).siteName
          .toLowerCase()
          .includes(filters.siteName.toLowerCase())
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * Sort articles by specified field and order
   */
  private static sortArticles(
    articles: Article[],
    sort: { field: keyof Article; order: "asc" | "desc" },
  ): Article[] {
    return [...articles].sort((a, b) => {
      const aValue = a[sort.field];
      const bValue = b[sort.field];

      let comparison = 0;

      if (aValue === null || aValue === undefined) {
        comparison = bValue === null || bValue === undefined ? 0 : -1;
      } else if (bValue === null || bValue === undefined) {
        comparison = 1;
      } else if (aValue instanceof Date && bValue instanceof Date) {
        comparison = aValue.getTime() - bValue.getTime();
      } else if (typeof aValue === "string" && typeof bValue === "string") {
        comparison = aValue.localeCompare(bValue);
      } else if (typeof aValue === "number" && typeof bValue === "number") {
        comparison = aValue - bValue;
      } else {
        comparison = String(aValue).localeCompare(String(bValue));
      }

      return sort.order === "desc" ? -comparison : comparison;
    });
  }

  /**
   * Sort articles by relevance to search query
   */
  private static sortByRelevance(
    articles: Article[],
    query: string,
  ): Article[] {
    if (!query.trim()) return articles;

    const searchTerms = query.toLowerCase().split(/\s+/);

    return [...articles].sort((a, b) => {
      const scoreA = this.calculateRelevanceScore(a, searchTerms);
      const scoreB = this.calculateRelevanceScore(b, searchTerms);
      return scoreB - scoreA; // Higher score first
    });
  }

  /**
   * Calculate relevance score for an article
   */
  private static calculateRelevanceScore(
    article: Article,
    searchTerms: string[],
  ): number {
    let score = 0;

    const title = article.title.toLowerCase();
    const content = article.content.toLowerCase();
    const excerpt = (article.excerpt || "").toLowerCase();
    const tags = (article.tags || []).join(" ").toLowerCase();

    for (const term of searchTerms) {
      // Title matches are worth more
      if (title.includes(term)) {
        score += title.indexOf(term) === 0 ? 10 : 5; // Exact start match is worth more
      }

      // Excerpt matches
      if (excerpt.includes(term)) {
        score += 3;
      }

      // Tag matches
      if (tags.includes(term)) {
        score += 4;
      }

      // Content matches
      const contentMatches = (content.match(new RegExp(term, "g")) || [])
        .length;
      score += Math.min(contentMatches, 5); // Cap content matches to avoid spam
    }

    // Boost recent articles slightly
    const daysSinceCreated =
      (Date.now() - article.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    score += Math.max(0, 1 - daysSinceCreated / 365); // Small boost for articles from last year

    return score;
  }

  /**
   * Generate search suggestions based on query and available articles
   */
  private static generateSuggestions(
    query: string,
    articles: Article[],
  ): string[] {
    if (!query.trim()) return [];

    const suggestions = new Set<string>();
    const queryLower = query.toLowerCase();

    // Collect potential suggestions from article titles and tags
    articles.forEach((article) => {
      // Title-based suggestions
      const titleWords = article.title.toLowerCase().split(/\s+/);
      titleWords.forEach((word) => {
        if (
          word.startsWith(queryLower) &&
          word !== queryLower &&
          word.length > 2
        ) {
          suggestions.add(word);
        }
      });

      // Tag-based suggestions
      (article.tags || []).forEach((tag) => {
        const tagLower = tag.toLowerCase();
        if (tagLower.startsWith(queryLower) && tagLower !== queryLower) {
          suggestions.add(tag);
        }
      });

      // Author-based suggestions
      if (article.author) {
        const authorLower = article.author.toLowerCase();
        if (authorLower.startsWith(queryLower) && authorLower !== queryLower) {
          suggestions.add(article.author);
        }
      }
    });

    return Array.from(suggestions).slice(0, 5); // Limit to 5 suggestions
  }

  /**
   * Generate facets for filtering search results
   */
  private static generateFacets(
    articles: Article[],
    currentFilters: SearchOptions["filters"] = {},
  ): Record<string, Array<{ value: string; count: number }>> {
    const facets: Record<string, Map<string, number>> = {
      tags: new Map(),
      authors: new Map(),
      sites: new Map(),
      folders: new Map(),
    };

    articles.forEach((article) => {
      // Tag facets
      if (facets.tags && article.tags) {
        article.tags.forEach((tag) => {
          facets.tags!.set(tag, (facets.tags!.get(tag) || 0) + 1);
        });
      }

      // Author facets
      if (facets.authors && article.author) {
        facets.authors.set(
          article.author,
          (facets.authors.get(article.author) || 0) + 1,
        );
      }

      // Site facets
      if (facets.sites && (article.metadata as any)?.siteName) {
        facets.sites.set(
          (article.metadata as any).siteName,
          (facets.sites.get((article.metadata as any).siteName) || 0) + 1,
        );
      }

      // Folder facets (would need folder names from database)
      if (facets.folders && article.folderId) {
        facets.folders.set(
          article.folderId,
          (facets.folders.get(article.folderId) || 0) + 1,
        );
      }
    });

    // Convert to required format and sort by count
    const result: Record<string, Array<{ value: string; count: number }>> = {};

    Object.entries(facets).forEach(([key, map]) => {
      result[key] = Array.from(map.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Limit to top 10 per facet
    });

    return result;
  }

  /**
   * Extract keywords from article content
   */
  static extractKeywords(content: string, maxKeywords: number = 10): string[] {
    // Simple keyword extraction - in production, use a proper NLP library
    const words = content
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3); // Filter short words

    // Count word frequency
    const wordCounts = new Map<string, number>();
    words.forEach((word) => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });

    // Get most frequent words
    return Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([word]) => word);
  }

  /**
   * Highlight search terms in text
   */
  static highlightSearchTerms(text: string, query: string): string {
    if (!query.trim()) return text;

    const searchTerms = query.split(/\s+/);
    let highlightedText = text;

    searchTerms.forEach((term) => {
      const regex = new RegExp(`(${term})`, "gi");
      highlightedText = highlightedText.replace(regex, "<mark>$1</mark>");
    });

    return highlightedText;
  }
}
