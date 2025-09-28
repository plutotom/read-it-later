/**
 * Zod validation schemas for Article types
 * Provides runtime validation for article-related data
 */

import { z } from "zod";

// Base article schema
export const articleSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  excerpt: z.string().max(1000).optional(),
  author: z.string().max(200).optional(),
  publishedAt: z.date().optional(),
  readAt: z.date().optional(),
  isRead: z.boolean().default(false),
  isArchived: z.boolean().default(false),
  folderId: z.string().uuid().optional(),
  isFavorite: z.boolean().default(false),
  createdAt: z.date(),
  updatedAt: z.date(),
  wordCount: z.number().int().min(0).optional(),
  readingTime: z.number().int().min(0).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  metadata: z
    .object({
      siteName: z.string().max(200).optional(),
      siteUrl: z.string().url().optional(),
      description: z.string().max(1000).optional(),
      imageUrl: z.string().url().optional(),
      language: z.string().length(2).optional(),
      category: z.string().max(100).optional(),
    })
    .optional(),
});

// Article creation schema
export const articleCreateSchema = z.object({
  url: z.string().url("Invalid URL format"),
  folderId: z.string().uuid().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

// Article update schema
export const articleUpdateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().min(1).optional(),
  excerpt: z.string().max(1000).optional(),
  author: z.string().max(200).optional(),
  publishedAt: z.date().optional(),
  isRead: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  folderId: z.string().uuid().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  metadata: z
    .object({
      siteName: z.string().max(200).optional(),
      siteUrl: z.string().url().optional(),
      description: z.string().max(1000).optional(),
      imageUrl: z.string().url().optional(),
      language: z.string().length(2).optional(),
      category: z.string().max(100).optional(),
    })
    .optional(),
});

// Article search schema
export const articleSearchSchema = z.object({
  query: z.string().max(200).optional(),
  folderId: z.string().uuid().optional(),
  isRead: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  sortBy: z
    .enum(["createdAt", "updatedAt", "publishedAt", "title", "readingTime"])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

// Article list response schema
export const articleListResponseSchema = z.object({
  articles: z.array(articleSchema),
  totalCount: z.number().int().min(0),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
});

// Article extraction result schema
export const articleExtractionResultSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  excerpt: z.string().max(1000).optional(),
  author: z.string().max(200).optional(),
  publishedAt: z.date().optional(),
  metadata: z
    .object({
      siteName: z.string().max(200).optional(),
      siteUrl: z.string().url().optional(),
      description: z.string().max(1000).optional(),
      imageUrl: z.string().url().optional(),
      language: z.string().length(2).optional(),
      category: z.string().max(100).optional(),
    })
    .optional(),
  wordCount: z.number().int().min(0),
  readingTime: z.number().int().min(0),
});

// Type exports for use in other files
export type ArticleInput = z.infer<typeof articleSchema>;
export type ArticleCreateInput = z.infer<typeof articleCreateSchema>;
export type ArticleUpdateInput = z.infer<typeof articleUpdateSchema>;
export type ArticleSearchInput = z.infer<typeof articleSearchSchema>;
export type ArticleListResponse = z.infer<typeof articleListResponseSchema>;
export type ArticleExtractionResult = z.infer<
  typeof articleExtractionResultSchema
>;
