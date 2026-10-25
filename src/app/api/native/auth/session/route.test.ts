import { beforeEach, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn());
vi.mock("~/server/auth", () => ({ auth: { api: { getSession } } }));
import { GET } from "./route";

beforeEach(() => getSession.mockReset());

it("rejects missing/revoked sessions without cacheable identity data", async () => {
  getSession.mockResolvedValue(null);
  const result = await GET(
    new Request("https://example.invalid/api/native/auth/session"),
  );
  expect(result.status).toBe(401);
  expect(result.headers.get("cache-control")).toContain("no-store");
  expect(await result.json()).toEqual({ code: "unauthorized" });
});

it("derives identity from the verified session and never returns bearer credentials", async () => {
  getSession.mockResolvedValue({
    user: {
      id: "account-a",
      name: "A",
      email: "a@example.invalid",
      privateField: "must-not-return",
    },
    session: { token: "must-not-return", expiresAt: new Date("2099-01-01") },
  });
  const request = new Request(
    "https://example.invalid/api/native/auth/session?userId=account-b",
    {
      headers: {
        Authorization: "Bearer signed-fixture",
        Cookie: "other-account-cookie=must-not-authenticate",
        "x-user-id": "account-b",
      },
    },
  );
  const result = await GET(request);
  const credentials = new Headers(request.headers);
  credentials.delete("cookie");
  expect(getSession).toHaveBeenCalledWith({
    headers: credentials,
    query: { disableCookieCache: true },
  });
  expect(await result.json()).toEqual({
    user: { id: "account-a", name: "A", email: "a@example.invalid" },
    expiresAt: "2099-01-01T00:00:00.000Z",
  });
});
