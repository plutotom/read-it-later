import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { nativeAuthOptions } from "~/server/native-auth-options";
import { NATIVE_LIBRARY_REQUEST_BYTES } from "~/lib/native-library";

const getSession = vi.hoisted(() => vi.fn());
const allowAuthAttempt = vi.hoisted(() => vi.fn());
vi.mock("~/server/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("~/server/services/native-auth/rate-limit", () => ({
  allowAuthAttempt,
}));
import { nativeLibraryRoute, readNativeLibraryBody } from "./http";

describe("native library authenticated HTTP boundary", () => {
  let signed: string, raw: string, cookie: string, user: string;
  let auth: ReturnType<typeof betterAuth>;
  const handle = vi.fn(async (owner: string) => ({ owner }));
  beforeAll(async () => {
    const data = { user: [], account: [], session: [], verification: [] };
    auth = betterAuth({
      ...nativeAuthOptions(),
      emailAndPassword: { enabled: true },
      database: memoryAdapter(data),
      baseURL: "https://example.com",
      secret: "synthetic-library-auth-secret-thirty-two-characters",
      rateLimit: { enabled: false },
    });
    const response = await auth.handler(
      new Request("https://example.com/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
        },
        body: JSON.stringify({
          name: "Synthetic fixture",
          email: "synthetic@example.invalid",
          password: "synthetic-fixture-password",
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      token: string;
      user: { id: string };
    };
    signed = response.headers.get("set-auth-token")!;
    cookie = response.headers.get("set-cookie")!.split(";")[0]!;
    raw = body.token;
    user = body.user.id;
  });
  beforeEach(() => {
    handle.mockClear();
    allowAuthAttempt.mockReset();
    allowAuthAttempt.mockResolvedValue(true);
    getSession.mockReset();
    getSession.mockImplementation(
      (input: Parameters<typeof auth.api.getSession>[0]) =>
        auth.api.getSession(input),
    );
  });

  it("uses the real pinned signed Bearer verifier and strips browser identity", async () => {
    const response = await nativeLibraryRoute(
      new Request("https://example.com/api/native/library?owner=attacker", {
        headers: {
          Authorization: `Bearer ${signed}`,
          Cookie: cookie,
          "x-user-id": "attacker",
        },
      }),
      handle,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ owner: user });
    const credentials = getSession.mock.calls[0]![0] as {
      headers: Headers;
      query: unknown;
    };
    expect([...credentials.headers.entries()]).toEqual([
      ["authorization", `Bearer ${signed}`],
    ]);
    expect(credentials.query).toEqual({ disableCookieCache: true });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(allowAuthAttempt).not.toHaveBeenCalled();
  });

  it("never authenticates raw, tampered or missing Bearers using a valid browser cookie", async () => {
    for (const token of [undefined, raw, signed + "tampered"]) {
      const headers = new Headers({ Cookie: cookie });
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const response = await nativeLibraryRoute(
        new Request("https://example.com/api/native/library", { headers }),
        handle,
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ code: "unauthorized" });
    }
    expect(handle).not.toHaveBeenCalled();
    expect(allowAuthAttempt).not.toHaveBeenCalled();
  });

  it("throttles mutation requests by the verified owner and returns 429 before handling the body", async () => {
    const request = () =>
      new Request(
        "https://example.com/api/native/library/mutations?owner=attacker",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${signed}`,
            "x-user-id": "attacker",
          },
          body: "invalid body that must not be parsed before admission",
        },
      );
    expect((await nativeLibraryRoute(request(), handle)).status).toBe(200);
    expect(allowAuthAttempt).toHaveBeenCalledWith(
      `native-library-mutations:${user}`,
      120,
    );
    handle.mockClear();
    allowAuthAttempt.mockResolvedValue(false);
    const response = await nativeLibraryRoute(request(), handle);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ code: "rate_limited" });
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(handle).not.toHaveBeenCalled();
  });

  it("fails closed if the durable mutation limiter is unavailable", async () => {
    allowAuthAttempt.mockRejectedValue(
      new Error("synthetic limiter store failure"),
    );
    const response = await nativeLibraryRoute(
      new Request("https://example.com/api/native/library/mutations", {
        method: "POST",
        headers: { Authorization: `Bearer ${signed}` },
      }),
      handle,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "service_unavailable" });
    expect(handle).not.toHaveBeenCalled();
  });

  it("returns a private generic error without leaking database internals", async () => {
    const response = await nativeLibraryRoute(
      new Request("https://example.com/api/native/library", {
        headers: { Authorization: `Bearer ${signed}` },
      }),
      async () => {
        throw new Error("sensitive SQL fixture");
      },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "service_unavailable" });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects a revoked signed session", async () => {
    await auth.handler(
      new Request("https://example.com/api/auth/sign-out", {
        method: "POST",
        headers: {
          Origin: "https://example.com",
          "Content-Type": "application/json",
          Authorization: `Bearer ${signed}`,
        },
        body: "{}",
      }),
    );
    const response = await nativeLibraryRoute(
      new Request("https://example.com/api/native/library", {
        headers: { Authorization: `Bearer ${signed}`, Cookie: cookie },
      }),
      handle,
    );
    expect(response.status).toBe(401);
    expect(handle).not.toHaveBeenCalled();
  });
});

describe("native library bounded request parser", () => {
  const request = (body: BodyInit, headers: Record<string, string> = {}) =>
    new Request("https://example.com/api/native/library/mutations", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
      // Node's streaming Request requires duplex; Next's incoming Request already has it.
      ...({ duplex: "half" } as Record<string, unknown>),
    });
  it("parses actual UTF-8 JSON", async () => {
    await expect(
      readNativeLibraryBody(request('{"text":"😀é"}')),
    ).resolves.toEqual({ text: "😀é" });
  });
  it("checks both declared and streamed body lengths, including absent/false content-length", async () => {
    await expect(
      readNativeLibraryBody(
        request("{}", {
          "Content-Length": String(NATIVE_LIBRARY_REQUEST_BYTES + 1),
        }),
      ),
    ).rejects.toMatchObject({ code: "request_too_large" });
    for (const headers of [{}, { "Content-Length": "1" }] as Record<
      string,
      string
    >[]) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(NATIVE_LIBRARY_REQUEST_BYTES));
          controller.enqueue(new Uint8Array(1));
          controller.close();
        },
      });
      await expect(
        readNativeLibraryBody(request(stream, headers)),
      ).rejects.toMatchObject({ code: "request_too_large" });
    }
  });
  it("rejects malformed JSON, invalid UTF-8, and non-JSON bodies", async () => {
    for (const body of ["{", new Uint8Array([0xff])])
      await expect(readNativeLibraryBody(request(body))).rejects.toMatchObject({
        code: "invalid_json",
      });
    await expect(
      readNativeLibraryBody(request("{}", { "Content-Type": "text/plain" })),
    ).rejects.toMatchObject({ code: "unsupported_media_type" });
  });
});
