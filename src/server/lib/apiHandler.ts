/**
 * Shared infrastructure for the public REST API (`/api/v1`).
 *
 * `defineRoute` wraps a handler with API-key authentication + scope checking,
 * consistent JSON error envelopes, and error handling, so individual route
 * files stay thin.
 */
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { authenticateApiRequest } from "~/server/lib/apiAuth";

export type ApiContext = {
  userId: string;
  apiKeyId: string;
  scopes: string[];
  request: Request;
  params: Record<string, string | string[] | undefined>;
  /** Read a required dynamic path segment, throwing 400 if absent. */
  param: (name: string) => string;
  searchParams: URLSearchParams;
};

/** Throw from a handler to return a structured error response. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status, headers: NO_STORE },
  );
}

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

export function created(data: unknown): NextResponse {
  return ok(data, 201);
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}

// Matches Next.js's generated route context (params is a Promise of a record
// whose values may be string | string[] | undefined). Must be required and
// non-optional or the build's route-signature validation rejects it.
type RouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

type Handler = (ctx: ApiContext) => Promise<unknown>;

/**
 * Build a Next.js route handler that authenticates the request against
 * `requiredScope` before invoking `handler`. A non-Response return value is
 * serialized as a 200 JSON body.
 */
export function defineRoute(requiredScope: string, handler: Handler) {
  return async function route(
    request: Request,
    routeCtx: RouteContext,
  ): Promise<NextResponse> {
    try {
      const auth = await authenticateApiRequest(
        request.headers.get("authorization"),
        requiredScope,
      );

      if (!auth.ok) {
        return auth.status === 403
          ? jsonError(403, "forbidden", "API key lacks the required scope")
          : jsonError(401, "unauthorized", "Missing or invalid API key");
      }

      const params = await routeCtx.params;
      const ctx: ApiContext = {
        userId: auth.userId,
        apiKeyId: auth.apiKeyId,
        scopes: auth.scopes,
        request,
        params,
        param: (name) => {
          const value = params[name];
          if (typeof value !== "string") {
            throw new ApiError(
              400,
              "invalid_path",
              `Missing path parameter: ${name}`,
            );
          }
          return value;
        },
        searchParams: new URL(request.url).searchParams,
      };

      const result = await handler(ctx);
      if (result instanceof NextResponse) return result;
      return ok(result);
    } catch (error) {
      if (error instanceof ApiError) {
        return jsonError(
          error.status,
          error.code,
          error.message,
          error.details,
        );
      }
      if (error instanceof ZodError) {
        return jsonError(
          422,
          "validation_error",
          "Request validation failed",
          error.flatten(),
        );
      }
      console.error("[api/v1] unhandled error:", error);
      return jsonError(
        500,
        "internal_error",
        error instanceof Error ? error.message : "Internal server error",
      );
    }
  };
}

/** Parse + validate a JSON request body, throwing ApiError on failure. */
export async function parseBody<T>(
  ctx: ApiContext,
  schema: ZodType<T>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await ctx.request.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError(
      422,
      "validation_error",
      "Request validation failed",
      result.error.flatten(),
    );
  }
  return result.data;
}

export type Pagination = { limit: number; cursor?: string };

/** Read `?limit=` (1–100, default 25) and opaque `?cursor=` query params. */
export function parsePagination(searchParams: URLSearchParams): Pagination {
  let limit = 25;
  const limitRaw = searchParams.get("limit");
  if (limitRaw !== null) {
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      throw new ApiError(
        400,
        "invalid_limit",
        "limit must be an integer between 1 and 100",
      );
    }
    limit = n;
  }
  const cursor = searchParams.get("cursor") ?? undefined;
  return { limit, cursor };
}

/** Read an optional boolean query param (`true`/`false`). */
export function parseBoolParam(
  searchParams: URLSearchParams,
  name: string,
): boolean | undefined {
  const raw = searchParams.get(name);
  if (raw === null) return undefined;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new ApiError(400, "invalid_query", `${name} must be 'true' or 'false'`);
}
