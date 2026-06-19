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
export interface ArticleCreate {
    url?: string;
    title?: string;
    content?: string;
    author?: string;
    publishedAt?: string;
    folderId?: string;
    tags?: string[];
}
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
export interface ShareResponse {
    shareToken: string;
    shareUrl: string;
}
export interface Me {
    id?: string;
    email?: string;
    name?: string;
    scopes?: string[];
    [key: string]: unknown;
}
export interface Tag {
    name?: string;
    tag?: string;
    count?: number;
    [key: string]: unknown;
}
export interface ApiErrorBody {
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
}
//# sourceMappingURL=types.d.ts.map