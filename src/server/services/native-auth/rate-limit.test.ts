import { beforeEach, describe, expect, it, vi } from "vitest";

const returning = vi.hoisted(() => vi.fn());
const execute = vi.hoisted(() => vi.fn());
vi.mock("~/server/db", () => ({
  db: {
    insert: () => ({
      values: () => ({ onConflictDoUpdate: () => ({ returning }) }),
    }),
    execute,
  },
}));
vi.mock("~/env", () => ({
  env: { AUTH_SECRET: "fixture-only-secret-at-least-32-characters" },
}));
import { passwordLoginLimit } from "./rate-limit";

function request(body: string, path = "sign-in/email") {
  return new Request(`https://example.invalid/api/auth/${path}`, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  returning.mockReset();
  execute.mockReset();
  execute.mockResolvedValue([]);
});

describe("password sign-in boundary", () => {
  it("leaves Discord and other existing auth routes unchanged", async () => {
    expect(
      await passwordLoginLimit(request("{}", "sign-in/social")),
    ).toBeNull();
    expect(returning).not.toHaveBeenCalled();
  });
  it("checks account and source budgets while preserving the original request body", async () => {
    returning.mockResolvedValue([{ value: "1" }]);
    const input = request(
      JSON.stringify({ email: "a@example.invalid", password: "fixture" }),
    );
    expect(await passwordLoginLimit(input)).toBeNull();
    expect(returning).toHaveBeenCalledTimes(2);
    expect(await input.json()).toEqual({
      email: "a@example.invalid",
      password: "fixture",
    });
  });
  it("returns a bounded retry response when the account is throttled", async () => {
    returning.mockResolvedValue([{ value: "6" }]);
    const result = await passwordLoginLimit(
      request('{"email":"a@example.invalid"}'),
    );
    expect(result?.status).toBe(429);
    expect(result?.headers.get("retry-after")).toBe("60");
  });
  it("fails closed on database failure and rejects oversized input before counters", async () => {
    returning.mockRejectedValue(new Error("fixture database failure"));
    expect(
      (await passwordLoginLimit(request('{"email":"a@example.invalid"}')))
        ?.status,
    ).toBe(503);
    returning.mockClear();
    expect((await passwordLoginLimit(request("x".repeat(4097))))?.status).toBe(
      413,
    );
    expect(returning).not.toHaveBeenCalled();
  });
});
