import { getPreferenceValues } from "@raycast/api";
import type {
  Article,
  ArticleCreate,
  ArticleUpdate,
  Folder,
  Me,
  ShareResponse,
  Tag,
  ApiErrorBody,
} from "./types";

export const API_BASE = "https://ril.plutotom.com/api/v1";

interface Preferences {
  apiKey: string;
}

export function getApiKey(): string {
  return getPreferenceValues<Preferences>().apiKey;
}

/** Auth + JSON headers shared by useFetch and the raw client. */
export function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}

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
      return "Invalid or missing API key. Update it in the extension preferences (⌘ ,).";
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

/**
 * Shared parser for useFetch: throws an ApiError with a friendly message on
 * non-2xx, otherwise returns the parsed JSON. Use as `parseResponse`.
 */
export async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(response.status, friendlyMessage(response.status, body), body?.error?.code);
  }
  return (await response.json()) as T;
}

/** Raw JSON client for mutations and one-off reads (outside useFetch). */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
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

// --- Endpoint helpers ---------------------------------------------------------

export function getMe(): Promise<Me> {
  return request<Me>("/me");
}

export function getFolders(): Promise<Folder[]> {
  return request<Folder[]>("/folders");
}

export function getTags(): Promise<Tag[]> {
  return request<Tag[]>("/tags");
}

export function getArticle(id: string): Promise<Article> {
  return request<Article>(`/articles/${id}`);
}

export function createArticle(body: ArticleCreate): Promise<Article> {
  return request<Article>("/articles", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateArticle(id: string, body: ArticleUpdate): Promise<Article> {
  return request<Article>(`/articles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteArticle(id: string): Promise<void> {
  await request<void>(`/articles/${id}`, { method: "DELETE" });
}

export function shareArticle(id: string): Promise<ShareResponse> {
  return request<ShareResponse>(`/articles/${id}/share`, { method: "POST" });
}

/** Article body as plain text or HTML (text/plain | text/html response). */
export async function getArticleContent(id: string, format: "text" | "html" = "text"): Promise<string> {
  const response = await fetch(`${API_BASE}/articles/${id}/content?format=${format}`, {
    headers: { Authorization: `Bearer ${getApiKey()}` },
  });
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(response.status, friendlyMessage(response.status, body), body?.error?.code);
  }
  return response.text();
}
