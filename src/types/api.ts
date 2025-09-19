/**
 * API request/response type definitions
 * Common types used across all API endpoints
 */

import type {
  Article,
  ArticleCreateInput,
  ArticleUpdateInput,
  ArticleListResponse,
  ArticleSearchParams,
} from "./article";
import type {
  Folder,
  FolderCreateInput,
  FolderUpdateInput,
  FolderListResponse,
} from "./folder";
import type {
  Highlight,
  Note,
  HighlightCreateInput,
  HighlightUpdateInput,
  NoteCreateInput,
  NoteUpdateInput,
  AnnotationResponse,
} from "./annotation";

// Common API response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Pagination types
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
    nextCursor?: string;
  };
}

// Search types
export interface SearchParams {
  query?: string;
  filters?: Record<string, unknown>;
  sort?: {
    field: string;
    order: "asc" | "desc";
  };
  pagination?: PaginationParams;
}

export interface SearchResponse<T> {
  results: T[];
  totalCount: number;
  facets?: Record<string, Array<{ value: string; count: number }>>;
  suggestions?: string[];
}

// Article API types
export interface ArticleApi {
  // Queries
  list: (
    params: ArticleSearchParams & PaginationParams,
  ) => Promise<ArticleListResponse>;
  getById: (id: string) => Promise<Article>;
  getByUrl: (url: string) => Promise<Article | null>;
  search: (params: SearchParams) => Promise<SearchResponse<Article>>;

  // Mutations
  create: (input: ArticleCreateInput) => Promise<Article>;
  update: (id: string, input: ArticleUpdateInput) => Promise<Article>;
  delete: (id: string) => Promise<void>;
  markAsRead: (id: string) => Promise<Article>;
  markAsUnread: (id: string) => Promise<Article>;
  archive: (id: string) => Promise<Article>;
  unarchive: (id: string) => Promise<Article>;
  moveToFolder: (id: string, folderId: string | null) => Promise<Article>;
  extractContent: (url: string) => Promise<Article>;
}

// Folder API types
export interface FolderApi {
  // Queries
  list: (params?: PaginationParams) => Promise<FolderListResponse>;
  getById: (id: string) => Promise<Folder>;
  getTree: () => Promise<Folder[]>;

  // Mutations
  create: (input: FolderCreateInput) => Promise<Folder>;
  update: (id: string, input: FolderUpdateInput) => Promise<Folder>;
  delete: (id: string) => Promise<void>;
  move: (id: string, parentId: string | null) => Promise<Folder>;
}

// Annotation API types
export interface AnnotationApi {
  // Highlight queries
  getHighlights: (articleId: string) => Promise<Highlight[]>;
  getHighlightById: (id: string) => Promise<Highlight>;

  // Highlight mutations
  createHighlight: (input: HighlightCreateInput) => Promise<Highlight>;
  updateHighlight: (
    id: string,
    input: HighlightUpdateInput,
  ) => Promise<Highlight>;
  deleteHighlight: (id: string) => Promise<void>;

  // Note queries
  getNotes: (articleId: string) => Promise<Note[]>;
  getNoteById: (id: string) => Promise<Note>;
  getNotesByHighlight: (highlightId: string) => Promise<Note[]>;

  // Note mutations
  createNote: (input: NoteCreateInput) => Promise<Note>;
  updateNote: (id: string, input: NoteUpdateInput) => Promise<Note>;
  deleteNote: (id: string) => Promise<void>;

  // Combined operations
  getAnnotations: (articleId: string) => Promise<AnnotationResponse>;
}

// Error types
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  statusCode: number;
}

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "EXTERNAL_SERVICE_ERROR";

// Success response types
export type ArticleListApiResponse = ApiResponse<ArticleListResponse>;
export type ArticleApiResponse = ApiResponse<Article>;
export type FolderListApiResponse = ApiResponse<FolderListResponse>;
export type FolderApiResponse = ApiResponse<Folder>;
export type AnnotationApiResponse = ApiResponse<AnnotationResponse>;
