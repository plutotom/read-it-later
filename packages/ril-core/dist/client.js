// A small, framework-agnostic client for the read-it-later public REST API
// (`/api/v1`, authenticated with a `ril_` API key). Ported from the Raycast
// extension's api.ts, but key/baseUrl are injected via `createClient` so any
// host (MCP server, Raycast, the app itself) can supply its own.
/** Default hosted instance. Includes the `/api/v1` prefix. */
export const DEFAULT_BASE_URL = "https://ril.plutotom.com/api/v1";
/** A typed error carrying the API's { error: { code, message } } envelope. */
export class ApiError extends Error {
    status;
    code;
    constructor(status, message, code) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.code = code;
    }
}
/** Turn an HTTP status + parsed body into a friendly, actionable message. */
export function friendlyMessage(status, body) {
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
async function readErrorBody(response) {
    try {
        return (await response.json());
    }
    catch {
        return undefined;
    }
}
export function createClient(config) {
    const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    const authHeaders = () => ({
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
    });
    async function request(path, init) {
        const response = await fetch(`${baseUrl}${path}`, {
            ...init,
            headers: { ...authHeaders(), ...(init?.headers ?? {}) },
        });
        if (response.status === 204) {
            return undefined;
        }
        if (!response.ok) {
            const body = await readErrorBody(response);
            throw new ApiError(response.status, friendlyMessage(response.status, body), body?.error?.code);
        }
        return (await response.json());
    }
    return {
        getMe: () => request("/me"),
        getFolders: () => request("/folders"),
        getTags: () => request("/tags"),
        getArticle: (id) => request(`/articles/${id}`),
        listArticles: (params = {}) => {
            const { q, ...rest } = params;
            const search = new URLSearchParams();
            for (const [key, value] of Object.entries(rest)) {
                if (value !== undefined)
                    search.set(key, String(value));
            }
            const trimmed = q?.trim();
            if (trimmed)
                search.set("q", trimmed);
            const path = trimmed ? "/search" : "/articles";
            return request(`${path}?${search.toString()}`);
        },
        createArticle: (body) => request("/articles", { method: "POST", body: JSON.stringify(body) }),
        updateArticle: (id, body) => request(`/articles/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
        deleteArticle: async (id) => {
            await request(`/articles/${id}`, { method: "DELETE" });
        },
        shareArticle: (id) => request(`/articles/${id}/share`, { method: "POST" }),
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
        listParaExports: () => request("/para/exports"),
        addToPara: (body) => request("/para/exports", { method: "POST", body: JSON.stringify(body) }),
        removeFromParaByArticleId: async (articleId) => {
            await request(`/para/exports?articleId=${encodeURIComponent(articleId)}`, {
                method: "DELETE",
            });
        },
        removeFromParaByExportId: async (exportId) => {
            await request(`/para/exports/${exportId}`, { method: "DELETE" });
        },
        getParaArticleStatuses: (articleIds) => {
            if (articleIds.length === 0)
                return Promise.resolve({});
            const query = encodeURIComponent(articleIds.join(","));
            return request(`/para/status?articleIds=${query}`);
        },
        listKindleDeliveries: () => request("/kindle/deliveries"),
        sendToKindle: (body) => request("/kindle/deliveries", {
            method: "POST",
            body: JSON.stringify(body),
        }),
        sendArticleToKindle: (articleId, force) => request(`/articles/${articleId}/kindle`, {
            method: "POST",
            body: JSON.stringify(force ? { force } : {}),
        }),
        getKindleArticleStatuses: (articleIds) => {
            if (articleIds.length === 0)
                return Promise.resolve({});
            const query = encodeURIComponent(articleIds.join(","));
            return request(`/kindle/status?articleIds=${query}`);
        },
    };
}
//# sourceMappingURL=client.js.map