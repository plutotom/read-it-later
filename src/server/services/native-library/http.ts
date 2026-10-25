import { auth } from "~/server/auth";
import { NATIVE_LIBRARY_REQUEST_BYTES } from "~/lib/native-library";
import { NativeLibraryError } from "./errors";
import { allowAuthAttempt } from "~/server/services/native-auth/rate-limit";

export const NATIVE_LIBRARY_MUTATION_REQUESTS_PER_MINUTE = 120;

const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization, Cookie",
  "X-Content-Type-Options": "nosniff",
};

export async function nativeLibraryRoute(
  request: Request,
  handle: (owner: string) => Promise<unknown>,
) {
  try {
    const authorization = request.headers.get("authorization");
    if (
      !authorization ||
      authorization.length > 4096 ||
      !/^Bearer [^\s]+$/u.test(authorization)
    )
      throw new NativeLibraryError("unauthorized", 401);
    // Only the signed Bearer is forwarded. A valid browser cookie must never
    // turn a missing, unsigned, expired or tampered native token into a login.
    const session = await auth.api.getSession({
      headers: new Headers({ Authorization: authorization }),
      query: { disableCookieCache: true },
    });
    if (!session || session.session.expiresAt.getTime() <= Date.now())
      throw new NativeLibraryError("unauthorized", 401);
    // Count requests (including idempotent retries), before parsing or writing.
    // This durable owner bucket is separate from auth and paid speech quotas.
    if (
      request.method === "POST" &&
      !(await allowAuthAttempt(
        `native-library-mutations:${session.user.id}`,
        NATIVE_LIBRARY_MUTATION_REQUESTS_PER_MINUTE,
      ))
    )
      throw new NativeLibraryError("rate_limited", 429);
    return Response.json(await handle(session.user.id), { headers });
  } catch (error) {
    if (error instanceof NativeLibraryError)
      return Response.json(
        { code: error.code },
        {
          status: error.status,
          headers: {
            ...headers,
            ...(error.status === 429 ? { "Retry-After": "60" } : {}),
          },
        },
      );
    // Never return SQL errors, article content, credentials or signing inputs.
    return Response.json(
      { code: "service_unavailable" },
      { status: 503, headers },
    );
  }
}

export async function readNativeLibraryBody(
  request: Request,
): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim() !==
    "application/json"
  )
    throw new NativeLibraryError("unsupported_media_type", 415);
  const declared = request.headers.get("content-length");
  if (
    declared &&
    (!/^\d+$/u.test(declared) ||
      Number(declared) > NATIVE_LIBRARY_REQUEST_BYTES)
  )
    throw new NativeLibraryError("request_too_large", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new NativeLibraryError("invalid_json", 400);
  const pieces: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > NATIVE_LIBRARY_REQUEST_BYTES) {
        await reader.cancel();
        throw new NativeLibraryError("request_too_large", 413);
      }
      pieces.push(value);
    }
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.concat(pieces),
      );
      return JSON.parse(text) as unknown;
    } catch {
      throw new NativeLibraryError("invalid_json", 400);
    }
  } finally {
    reader.releaseLock();
  }
}
