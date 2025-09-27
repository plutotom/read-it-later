/**
 * Folder type definitions for organizing articles
 * Represents a folder/category for grouping articles
 */

export interface Folder {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  parentId: string | null;
  isDefault: boolean;
  articleCount: number;
  createdAt: Date;
  updatedAt: Date;
  userId: string | null; // For future multi-user support
}

export interface FolderCreateInput {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  parentId?: string;
}

export interface FolderUpdateInput {
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
  parentId?: string;
}

export interface FolderWithArticles extends Folder {
  articles: Article[];
  subfolders: Folder[];
}

export interface FolderTree {
  id: string;
  name: string;
  children: FolderTree[];
  articleCount: number;
}

export interface FolderListResponse {
  folders: Folder[];
  totalCount: number;
}

// Re-export Article type for convenience
import type { Article } from "./article";
