// Types mirror the read-it-later OpenAPI schemas
// (GET https://ril.plutotom.com/api/v1/openapi.json).

export interface Article {
  id: string;
  url: string;
  title: string;
  content?: string;
  excerpt: string | null;
  author: string | null;
  publishedAt: string | null;
  isFavorite: boolean;
  isRead: boolean;
  isArchived: boolean;
  readAt: string | null;
  folderId: string | null;
  wordCount: number | null;
  readingTime: number | null;
  tags: string[] | null;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ArticleList {
  data: Article[];
  nextCursor: string | null;
}

// POST /articles — provide `url` to import, or `title`+`content` for manual entry.
export interface ArticleCreate {
  url?: string;
  title?: string;
  content?: string;
  author?: string;
  publishedAt?: string;
  folderId?: string;
  tags?: string[];
}

// PATCH /articles/{id}
export interface ArticleUpdate {
  title?: string;
  url?: string;
  folderId?: string | null;
  tags?: string[] | null;
  isFavorite?: boolean;
  isRead?: boolean;
  isArchived?: boolean;
}

export interface Folder {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  parentId: string | null;
  isDefault: boolean;
  articleCount: number;
  createdAt: string;
  updatedAt: string;
}

// POST /articles/{id}/share
export interface ShareResponse {
  shareToken: string;
  shareUrl: string;
}

// GET /me — key owner and scopes. Shape is documented only loosely, so keep it tolerant.
export interface Me {
  id?: string;
  email?: string;
  name?: string;
  scopes?: string[];
  [key: string]: unknown;
}

// GET /tags — tags with article counts. Tolerant shape; only name is relied upon.
export interface Tag {
  name?: string;
  tag?: string;
  count?: number;
  [key: string]: unknown;
}

// GET /para/exports
export interface ParaExport {
  id: string;
  articleId: string | null;
  title: string;
  filename: string;
  bytes: number;
  isLarge: boolean;
  gotoPage: number | null;
  gotoVersion: number;
  gotoSetAt: string | null;
  createdAt: string;
}

// POST /para/exports
export interface ParaExportCreate {
  articleId: string;
}

// GET /para/status
export type ParaArticleStatuses = Record<string, boolean>;

// GET /kindle/deliveries
export interface KindleDelivery {
  id: string;
  articleId: string | null;
  articleTitle: string | null;
  status: "pending" | "sent" | "failed" | string;
  filename: string;
  bytes: number;
  sentAt: string | null;
  createdAt: string;
  errorMessage: string | null;
}

// POST /kindle/deliveries
export interface KindleDeliveryCreate {
  articleId: string;
  force?: boolean;
}

// GET /kindle/status
export type KindleArticleStatuses = Record<
  string,
  "sent" | "failed" | "pending" | false
>;

// Error envelope: { error: { code, message, details? } }
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
