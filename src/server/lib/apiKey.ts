import { createHash, randomBytes } from "node:crypto";
import { API_KEY_PREFIX } from "~/lib/paraConstants";

export function generateApiKey(): string {
  return `${API_KEY_PREFIX}${randomBytes(24).toString("hex")}`;
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function getApiKeyPrefix(key: string): string {
  const withoutPrefix = key.startsWith(API_KEY_PREFIX)
    ? key.slice(API_KEY_PREFIX.length)
    : key;
  return withoutPrefix.slice(0, 8);
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match?.[1]?.trim() ?? null;
}
