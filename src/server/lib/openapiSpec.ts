/**
 * Hand-maintained OpenAPI 3.1 document for the public REST API (`/api/v1`).
 *
 * Served at `GET /api/v1/openapi.json`. Drives MCP tool generation and gives
 * Raycast / Chrome / other clients a machine-readable contract. Keep this in
 * sync when adding or changing endpoints.
 */

const bearerAuth = [{ bearerAuth: [] as string[] }];

const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
} as const;

const paginationParams = [
  {
    name: "limit",
    in: "query",
    required: false,
    schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
  },
  {
    name: "cursor",
    in: "query",
    required: false,
    schema: { type: "string" },
    description: "Opaque cursor from a previous response's `nextCursor`.",
  },
] as const;

const articleFilterParams = [
  { name: "folderId", in: "query", schema: { type: "string", format: "uuid" } },
  { name: "tag", in: "query", schema: { type: "string" } },
  { name: "q", in: "query", schema: { type: "string" } },
  { name: "isArchived", in: "query", schema: { type: "boolean" } },
  { name: "isRead", in: "query", schema: { type: "boolean" } },
  { name: "isFavorite", in: "query", schema: { type: "boolean" } },
] as const;

export function buildOpenApiSpec(baseUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "read-it-later API",
      version: "1.0.0",
      description:
        "Manage your saved articles, folders, tags, highlights and notes. Authenticate with an API key: `Authorization: Bearer <key>`. Read endpoints require the `ril:read` scope; write endpoints require `ril:write`.",
    },
    servers: [{ url: `${baseUrl.replace(/\/$/, "")}/api/v1` }],
    security: bearerAuth,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "API key" },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: {},
              },
              required: ["code", "message"],
            },
          },
        },
        Article: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            url: { type: "string" },
            title: { type: "string" },
            content: { type: "string" },
            excerpt: { type: ["string", "null"] },
            author: { type: ["string", "null"] },
            publishedAt: { type: ["string", "null"], format: "date-time" },
            isFavorite: { type: "boolean" },
            isRead: { type: "boolean" },
            isArchived: { type: "boolean" },
            readAt: { type: ["string", "null"], format: "date-time" },
            folderId: { type: ["string", "null"], format: "uuid" },
            wordCount: { type: ["integer", "null"] },
            readingTime: { type: ["integer", "null"] },
            tags: { type: ["array", "null"], items: { type: "string" } },
            shareToken: { type: ["string", "null"] },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        ArticleList: {
          type: "object",
          properties: {
            data: { type: "array", items: { $ref: "#/components/schemas/Article" } },
            nextCursor: { type: ["string", "null"] },
          },
        },
        ArticleCreate: {
          type: "object",
          description:
            "Provide `url` to import a web page, or `title`+`content` to create from text.",
          properties: {
            url: { type: "string", format: "uri" },
            title: { type: "string" },
            content: { type: "string" },
            author: { type: "string" },
            publishedAt: { type: "string", format: "date-time" },
            folderId: { type: "string", format: "uuid" },
            tags: { type: "array", items: { type: "string" } },
          },
        },
        ArticleUpdate: {
          type: "object",
          properties: {
            title: { type: "string" },
            url: { type: "string", format: "uri" },
            folderId: { type: ["string", "null"], format: "uuid" },
            tags: { type: ["array", "null"], items: { type: "string" } },
            isFavorite: { type: "boolean" },
            isRead: { type: "boolean" },
            isArchived: { type: "boolean" },
          },
        },
        Folder: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            description: { type: ["string", "null"] },
            color: { type: ["string", "null"] },
            icon: { type: ["string", "null"] },
            parentId: { type: ["string", "null"], format: "uuid" },
            isDefault: { type: "boolean" },
            articleCount: { type: "integer" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Highlight: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            articleId: { type: "string", format: "uuid" },
            text: { type: "string" },
            startOffset: { type: "integer" },
            endOffset: { type: "integer" },
            color: {
              type: "string",
              enum: [
                "yellow",
                "green",
                "blue",
                "pink",
                "purple",
                "orange",
                "red",
                "gray",
              ],
            },
            contextPrefix: { type: ["string", "null"] },
            contextSuffix: { type: ["string", "null"] },
            version: { type: "integer" },
            anchorContentHash: { type: ["string", "null"] },
            anchorStatus: { type: "string", enum: ["anchored", "lost"] },
            tags: { type: ["array", "null"], items: { type: "string" } },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Note: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            articleId: { type: "string", format: "uuid" },
            highlightId: { type: ["string", "null"], format: "uuid" },
            content: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
    paths: {
      "/me": {
        get: {
          summary: "Identify the current API key",
          operationId: "getMe",
          responses: { "200": { description: "Key owner and scopes" } },
        },
      },
      "/articles": {
        get: {
          summary: "List articles",
          operationId: "listArticles",
          parameters: [...paginationParams, ...articleFilterParams],
          responses: {
            "200": {
              description: "Paginated articles",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ArticleList" },
                },
              },
            },
          },
        },
        post: {
          summary: "Create (import or from text) an article",
          operationId: "createArticle",
          security: bearerAuth,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ArticleCreate" },
              },
            },
          },
          responses: {
            "201": {
              description: "Created",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Article" },
                },
              },
            },
          },
        },
      },
      "/articles/{id}": {
        get: {
          summary: "Get an article",
          operationId: "getArticle",
          parameters: [idParam],
          responses: {
            "200": {
              description: "Article",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Article" },
                },
              },
            },
            "404": { description: "Not found" },
          },
        },
        patch: {
          summary: "Update an article (metadata and state)",
          operationId: "updateArticle",
          parameters: [idParam],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ArticleUpdate" },
              },
            },
          },
          responses: { "200": { description: "Updated article" } },
        },
        delete: {
          summary: "Delete an article",
          operationId: "deleteArticle",
          parameters: [idParam],
          responses: { "204": { description: "Deleted" } },
        },
      },
      "/articles/{id}/content": {
        get: {
          summary: "Get article body as text or html",
          operationId: "getArticleContent",
          parameters: [
            idParam,
            {
              name: "format",
              in: "query",
              schema: { type: "string", enum: ["text", "html"], default: "text" },
            },
          ],
          responses: {
            "200": {
              description: "Body",
              content: { "text/plain": {}, "text/html": {} },
            },
          },
        },
      },
      "/articles/{id}/share": {
        post: {
          summary: "Create or fetch a public share link",
          operationId: "shareArticle",
          parameters: [idParam],
          responses: { "200": { description: "Share token and URL" } },
        },
      },
      "/articles/{id}/highlights": {
        get: {
          summary: "List an article's highlights",
          operationId: "listHighlights",
          parameters: [idParam],
          responses: { "200": { description: "Highlights" } },
        },
        post: {
          summary: "Create a highlight",
          operationId: "createHighlight",
          parameters: [idParam],
          requestBody: { required: true, content: { "application/json": {} } },
          responses: { "201": { description: "Created highlight" } },
        },
      },
      "/articles/{id}/notes": {
        get: {
          summary: "List an article's notes",
          operationId: "listNotes",
          parameters: [idParam],
          responses: { "200": { description: "Notes" } },
        },
        post: {
          summary: "Create a note",
          operationId: "createNote",
          parameters: [idParam],
          requestBody: { required: true, content: { "application/json": {} } },
          responses: { "201": { description: "Created note" } },
        },
      },
      "/highlights/{id}": {
        patch: {
          summary: "Update a highlight",
          operationId: "updateHighlight",
          parameters: [idParam],
          requestBody: { required: true, content: { "application/json": {} } },
          responses: { "200": { description: "Updated highlight" } },
        },
        delete: {
          summary: "Delete a highlight",
          operationId: "deleteHighlight",
          parameters: [idParam],
          responses: { "204": { description: "Deleted" } },
        },
      },
      "/notes/{id}": {
        patch: {
          summary: "Update a note",
          operationId: "updateNote",
          parameters: [idParam],
          requestBody: { required: true, content: { "application/json": {} } },
          responses: { "200": { description: "Updated note" } },
        },
        delete: {
          summary: "Delete a note",
          operationId: "deleteNote",
          parameters: [idParam],
          responses: { "204": { description: "Deleted" } },
        },
      },
      "/folders": {
        get: {
          summary: "List folders",
          operationId: "listFolders",
          responses: { "200": { description: "Folders" } },
        },
        post: {
          summary: "Create a folder",
          operationId: "createFolder",
          requestBody: { required: true, content: { "application/json": {} } },
          responses: { "201": { description: "Created folder" } },
        },
      },
      "/folders/{id}": {
        get: {
          summary: "Get a folder",
          operationId: "getFolder",
          parameters: [idParam],
          responses: { "200": { description: "Folder" } },
        },
        patch: {
          summary: "Update a folder",
          operationId: "updateFolder",
          parameters: [idParam],
          requestBody: { required: true, content: { "application/json": {} } },
          responses: { "200": { description: "Updated folder" } },
        },
        delete: {
          summary: "Delete a folder",
          operationId: "deleteFolder",
          parameters: [idParam],
          responses: { "204": { description: "Deleted" } },
        },
      },
      "/tags": {
        get: {
          summary: "List tags with article counts",
          operationId: "listTags",
          responses: { "200": { description: "Tags" } },
        },
      },
      "/search": {
        get: {
          summary: "Search articles",
          operationId: "searchArticles",
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string" } },
            ...paginationParams,
            ...articleFilterParams.filter((p) => p.name !== "q"),
          ],
          responses: {
            "200": {
              description: "Matching articles",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ArticleList" },
                },
              },
            },
          },
        },
      },
    },
  };
}
