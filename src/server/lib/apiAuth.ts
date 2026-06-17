import { and, eq, isNull } from "drizzle-orm";
import { db } from "~/server/db";
import { apiKeys } from "~/server/db/schema";
import { extractBearerToken, hashApiKey } from "~/server/lib/apiKey";
import { RIL_READ_SCOPE, RIL_WRITE_SCOPE } from "~/lib/paraConstants";

export type ApiAuthSuccess = {
  ok: true;
  userId: string;
  apiKeyId: string;
  scopes: string[];
};

export type ApiAuthFailure = {
  ok: false;
  /** 401: no/invalid/revoked key. 403: valid key, missing required scope. */
  status: 401 | 403;
};

export type ApiAuthResult = ApiAuthSuccess | ApiAuthFailure;

/**
 * Whether a key's granted scopes satisfy a required scope.
 * `ril:write` implies `ril:read` (a writable key can always read).
 */
export function scopesSatisfy(granted: string[], required: string): boolean {
  if (granted.includes(required)) return true;
  if (required === RIL_READ_SCOPE && granted.includes(RIL_WRITE_SCOPE)) {
    return true;
  }
  return false;
}

/**
 * Authenticate an incoming request by its `Authorization: Bearer <key>` header
 * and verify the key carries `requiredScope`.
 *
 * Returns 401 when the key is missing/invalid/revoked, 403 when the key is
 * valid but lacks the required scope.
 */
export async function authenticateApiRequest(
  authHeader: string | null,
  requiredScope: string,
): Promise<ApiAuthResult> {
  const token = extractBearerToken(authHeader);

  if (!token) {
    return { ok: false, status: 401 };
  }

  const keyHash = hashApiKey(token);

  const key = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)),
  });

  if (!key) {
    return { ok: false, status: 401 };
  }

  if (!scopesSatisfy(key.scopes, requiredScope)) {
    return { ok: false, status: 403 };
  }

  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, key.id));

  return {
    ok: true,
    userId: key.userId,
    apiKeyId: key.id,
    scopes: key.scopes,
  };
}

export function getRequestBaseUrl(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");

  if (host) {
    const proto =
      request.headers.get("x-forwarded-proto") ??
      (host.includes("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }

  return process.env.AUTH_URL ?? "http://localhost:3000";
}
