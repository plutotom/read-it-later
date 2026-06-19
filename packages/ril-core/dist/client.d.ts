import type { Article, ArticleCreate, ArticleList, ArticleUpdate, ApiErrorBody, Folder, Me, ShareResponse, Tag } from "./types.js";
/** Default hosted instance. Includes the `/api/v1` prefix. */
export declare const DEFAULT_BASE_URL = "https://ril.plutotom.com/api/v1";
/** A typed error carrying the API's { error: { code, message } } envelope. */
export declare class ApiError extends Error {
    status: number;
    code?: string;
    constructor(status: number, message: string, code?: string);
}
/** Turn an HTTP status + parsed body into a friendly, actionable message. */
export declare function friendlyMessage(status: number, body?: ApiErrorBody): string;
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
export declare function createClient(config: ClientConfig): RilClient;
//# sourceMappingURL=client.d.ts.map