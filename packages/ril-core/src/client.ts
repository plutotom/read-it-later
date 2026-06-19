// A small, framework-agnostic client for the read-it-later public REST API
// (`/api/v1`, authenticated with a `ril_` API key). Ported from the Raycast
// extension's api.ts, but key/baseUrl are injected via `createClient` so any
// host (MCP server, Raycast, the app itself) can supply its own.

import type {
  Article,
  ArticleCreate,
  ArticleList,
  ArticleUpdate,
  ApiErrorBody,
  Folder,
  Me,
  ShareResponse,
  Tag,
} from "./types.js";

/** Default hosted instance. Includes the `/api/v1` prefix. */
export const DEFAULT_BASE_URL = "https://ril.plutotom.com/api/v1";

/** A typed error carrying the API's { error: { code, message } } envelope. */
export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Turn an HTTP status + parsed body into a friendly, actionable message. */
export function friendlyMessage(status: number, body?: ApiErrorBody): string {
  const apiMessage = body?.error?.message;
  switch (status) {
    case 401:
      return "Invalid or missing API key. Set RIL_API_KEY to a valid ril_ key.";
    case 403:
      return apiMessage ?? "Your API key is missing the required scope for this action.";
    case 404:
      return apiMessage ?? "Not found.";
    case 422:
      return apiMessage ?? "Validation failed — check the values you provided.";
    default:
      return apiMessage ?? `Request failed (${status}).`;
  }
}

async function readErrorBody(response: Response): Promise<ApiErrorBody | undefined> {
  try {
    return (await response.json()) as ApiErrorBody;
  } catch {
    return undefined;
  }
}

export interface ClientConfig {
  /** A read-it-later API key (`ril_...`). */
  apiKey: string;
  /** Full API base URL including `/api/v1`. Defaults to {@link DEFAULT_BASE_URL}. */
  baseUrl?: string;
}

export interface ListArticlesParams {
  /** Free-text query. When set, hits /search; otherwise the full /articles list. */
  q?: string;
  limit?: number;
  cursor?: string;
  tag?: string;
  folderId?: string;
  isRead?: boolean;
  isFavorite?: boolean;
  isArchived?: boolean;
}

export interface RilClient {
  getMe(): Promise<Me>;
  getFolders(): Promise<Folder[]>;
  getTags(): Promise<Tag[]>;
  getArticle(id: string): Promise<Article>;
  /** List articles (most recent first) or search them. Returns one page. */
  listArticles(params?: ListArticlesParams): Promise<ArticleList>;
  createArticle(body: ArticleCreate): Promise<Article>;
  updateArticle(id: string, body: ArticleUpdate): Promise<Article>;
  deleteArticle(id: string): Promise<void>;
  shareArticle(id: string): Promise<ShareResponse>;
  /** Article body as plain text or HTML (text/plain | text/html response). */
  getArticleContent(id: string, format?: "text" | "html"): Promise<string>;
}

export function createClient(config: ClientConfig): RilClient {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");

  const authHeaders = (): Record<string, string> => ({
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  });

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { ...authHeaders(), ...(init?.headers ?? {}) },
    });

    if (response.status === 204) {
      return undefined as T;
    }
    if (!response.ok) {
      const body = await readErrorBody(response);
      throw new ApiError(response.status, friendlyMessage(response.status, body), body?.error?.code);
    }
    return (await response.json()) as T;
  }

  return {
    getMe: () => request<Me>("/me"),
    getFolders: () => request<Folder[]>("/folders"),
    getTags: () => request<Tag[]>("/tags"),
    getArticle: (id) => request<Article>(`/articles/${id}`),

    listArticles: (params = {}) => {
      const { q, ...rest } = params;
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined) search.set(key, String(value));
      }
      const trimmed = q?.trim();
      if (trimmed) search.set("q", trimmed);
      const path = trimmed ? "/search" : "/articles";
      return request<ArticleList>(`${path}?${search.toString()}`);
    },

    createArticle: (body) =>
      request<Article>("/articles", { method: "POST", body: JSON.stringify(body) }),

    updateArticle: (id, body) =>
      request<Article>(`/articles/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

    deleteArticle: async (id) => {
      await request<void>(`/articles/${id}`, { method: "DELETE" });
    },

    shareArticle: (id) =>
      request<ShareResponse>(`/articles/${id}/share`, { method: "POST" }),

    getArticleContent: async (id, format = "text") => {
      const response = await fetch(`${baseUrl}/articles/${id}/content?format=${format}`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      if (!response.ok) {
        const body = await readErrorBody(response);
        throw new ApiError(response.status, friendlyMessage(response.status, body), body?.error?.code);
      }
      return response.text();
    },
  };
}
