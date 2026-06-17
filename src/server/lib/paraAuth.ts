import { PARA_READ_SCOPE } from "~/lib/paraConstants";
import {
  authenticateApiRequest,
  getRequestBaseUrl,
} from "~/server/lib/apiAuth";

export type ParaAuthResult =
  | { ok: true; userId: string; apiKeyId: string }
  | { ok: false; status: 401 | 403 };

/**
 * Backwards-compatible wrapper used by the `/api/para/*` firmware endpoints.
 * Delegates to the shared {@link authenticateApiRequest}.
 */
export async function authenticateParaRequest(
  authHeader: string | null,
  requiredScope: string = PARA_READ_SCOPE,
): Promise<ParaAuthResult> {
  const result = await authenticateApiRequest(authHeader, requiredScope);
  if (!result.ok) {
    return { ok: false, status: result.status };
  }
  return { ok: true, userId: result.userId, apiKeyId: result.apiKeyId };
}

export { getRequestBaseUrl };
