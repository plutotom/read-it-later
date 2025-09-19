/**
 * Zod validation schemas for Folder types
 * Provides runtime validation for folder-related data
 */

import { z } from "zod";

// Base folder schema
export const folderSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  icon: z.string().max(50).optional(),
  parentId: z.string().uuid().optional(),
  isDefault: z.boolean().default(false),
  articleCount: z.number().int().min(0).default(0),
  createdAt: z.date(),
  updatedAt: z.date(),
  userId: z.string().uuid().optional(),
});

// Folder creation schema
export const folderCreateSchema = z.object({
  name: z
    .string()
    .min(1, "Folder name is required")
    .max(100, "Folder name too long"),
  description: z.string().max(500).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format")
    .optional(),
  icon: z.string().max(50).optional(),
  parentId: z.string().uuid().optional(),
});

// Folder update schema
export const folderUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  icon: z.string().max(50).optional(),
  parentId: z.string().uuid().optional(),
});

// Simplified folder schemas to avoid circular reference issues
export const folderWithArticlesSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  icon: z.string().max(50).optional(),
  parentId: z.string().uuid().optional(),
  isDefault: z.boolean(),
  articleCount: z.number().int().min(0),
  createdAt: z.date(),
  updatedAt: z.date(),
  userId: z.string().uuid().optional(),
  articles: z.array(z.any()), // Will be validated with article schema
  subfolders: z.array(z.any()),
});

// Simplified folder tree schema
export const folderTreeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  children: z.array(z.any()),
  articleCount: z.number().int().min(0),
});

// Folder list response schema
export const folderListResponseSchema = z.object({
  folders: z.array(folderSchema),
  totalCount: z.number().int().min(0),
});

// Folder move schema
export const folderMoveSchema = z.object({
  parentId: z.string().uuid().nullable(),
});

// Type exports for use in other files
export type FolderInput = z.infer<typeof folderSchema>;
export type FolderCreateInput = z.infer<typeof folderCreateSchema>;
export type FolderUpdateInput = z.infer<typeof folderUpdateSchema>;
export type FolderWithArticles = z.infer<typeof folderWithArticlesSchema>;
export type FolderTree = z.infer<typeof folderTreeSchema>;
export type FolderListResponse = z.infer<typeof folderListResponseSchema>;
export type FolderMoveInput = z.infer<typeof folderMoveSchema>;
