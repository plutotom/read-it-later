/**
 * Article type definitions for the read-it-later app
 * Represents a saved web article with extracted content
 */

export interface Article {
  id: string;
  url: string;
  title: string;
  content: string;
  excerpt: string | null;
  author: string | null;
  publishedAt: Date | null;
  isFavorite: boolean;
  readAt: Date | null;
  isRead: boolean;
  isArchived: boolean;
  folderId: string | null;
  createdAt: Date;
  updatedAt: Date;
  wordCount: number | null;
  readingTime: number | null; // in minutes
  tags: string[] | null;
  metadata: unknown;
}

export interface ArticleMetadata {
  siteName?: string;
  siteUrl?: string;
  description?: string;
  imageUrl?: string;
  language?: string;
  category?: string;
}

export interface ArticleCreateInput {
  url: string;
  folderId?: string;
  tags?: string[];
}

export interface ArticleUpdateInput {
  title?: string;
  content?: string;
  excerpt?: string;
  author?: string;
  publishedAt?: Date;
  isRead?: boolean;
  isArchived?: boolean;
  folderId?: string;
  tags?: string[];
  metadata?: ArticleMetadata;
}

export interface ArticleListResponse {
  articles: Article[];
  totalCount: number;
  hasMore: boolean;
  nextCursor?: string;
}

export interface ArticleSearchParams {
  query?: string;
  folderId?: string;
  isRead?: boolean;
  isArchived?: boolean;
  tags?: string[];
  sortBy?: "createdAt" | "updatedAt" | "publishedAt" | "title" | "readingTime";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface ArticleExtractionResult {
  title: string;
  content: string;
  excerpt?: string;
  author?: string;
  publishedAt?: Date;
  metadata?: ArticleMetadata;
  wordCount: number;
  readingTime: number;
}
