import { and, eq, isNull } from "drizzle-orm";
import { db } from "~/server/db";
import { apiKeys } from "~/server/db/schema";
import { extractBearerToken, hashApiKey } from "~/server/lib/apiKey";
import { PARA_READ_SCOPE } from "~/lib/paraConstants";

export type ParaAuthResult =
  | { ok: true; userId: string; apiKeyId: string }
  | { ok: false; status: 401 };

export async function authenticateParaRequest(
  authHeader: string | null,
  requiredScope: string = PARA_READ_SCOPE,
): Promise<ParaAuthResult> {
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

  if (!key.scopes.includes(requiredScope)) {
    return { ok: false, status: 401 };
  }

  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, key.id));

  return { ok: true, userId: key.userId, apiKeyId: key.id };
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
