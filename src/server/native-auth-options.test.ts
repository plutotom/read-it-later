import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { nativeAuthOptions } from "./native-auth-options";

describe("native authentication against the pinned Better Auth implementation", () => {
  it("adds a password to the same social identity, validates signed bearer sessions, and revokes only the native session", async () => {
    const data: {
      user: Record<string, unknown>[];
      account: Record<string, unknown>[];
      session: Record<string, unknown>[];
      verification: Record<string, unknown>[];
    } = {
      user: [],
      account: [],
      session: [],
      verification: [],
    };
    const base = {
      ...nativeAuthOptions(),
      baseURL: "https://auth.example.invalid",
      secret: "fixture-only-auth-secret-at-least-32-characters",
      database: memoryAdapter(data),
      rateLimit: { enabled: false },
    };
    const seed = betterAuth({
      ...base,
      emailAndPassword: { ...base.emailAndPassword, disableSignUp: false },
    });
    const request = (
      path: string,
      body: unknown,
      headers: Record<string, string> = {},
    ) =>
      new Request(`https://auth.example.invalid/api/auth/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://auth.example.invalid",
          ...headers,
        },
        body: JSON.stringify(body),
      });
    const seeded = await seed.handler(
      request("sign-up/email", {
        name: "Native fixture",
        email: "fixture@example.invalid",
        password: "temporary-fixture-password",
      }),
    );
    expect(seeded.status).toBe(200);
    const seedBody = (await seeded.json()) as { user: { id: string } };
    const userID = seedBody.user.id;
    const browserToken = seeded.headers.get("set-auth-token")!;
    expect(browserToken).toBeTruthy();
    // A pre-existing social user has no credential account before password enrollment.
    data.account = data.account.filter((row) => row.userId !== userID);
    data.account.push({
      id: "fixture-discord",
      userId: userID,
      providerId: "discord",
      accountId: "fixture-discord-id",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const auth = betterAuth(base);
    await expect(
      auth.api.setPassword({
        headers: new Headers({ Authorization: `Bearer ${browserToken}` }),
        body: { newPassword: "native-fixture-password" },
      }),
    ).resolves.toMatchObject({ status: true });
    expect(data.user).toHaveLength(1);
    expect(
      data.account.filter((row) => row.providerId === "discord"),
    ).toHaveLength(1);
    expect(
      data.account.filter((row) => row.providerId === "credential"),
    ).toHaveLength(1);

    const login = await auth.handler(
      request("sign-in/email", {
        email: "fixture@example.invalid",
        password: "native-fixture-password",
      }),
    );
    expect(login.status).toBe(200);
    const signed = login.headers.get("set-auth-token")!;
    const loginBody = (await login.json()) as {
      token: string;
      user: { id: string };
    };
    expect(loginBody.user.id).toBe(userID);
    expect(signed).not.toBe(browserToken);
    const headers = new Headers({ Authorization: `Bearer ${signed}` });
    expect(
      (
        await auth.api.getSession({
          headers,
          query: { disableCookieCache: true },
        })
      )?.user.id,
    ).toBe(userID);
    expect(
      await auth.api.getSession({
        headers: new Headers({ Authorization: `Bearer ${loginBody.token}` }),
      }),
    ).toBeNull();
    expect(
      await auth.api.getSession({
        headers: new Headers({ Authorization: `Bearer ${signed}tampered` }),
      }),
    ).toBeNull();
    await auth.handler(
      request("sign-out", {}, { Authorization: `Bearer ${signed}` }),
    );
    expect(
      await auth.api.getSession({
        headers,
        query: { disableCookieCache: true },
      }),
    ).toBeNull();
    expect(
      (
        await auth.api.getSession({
          headers: new Headers({ Authorization: `Bearer ${browserToken}` }),
          query: { disableCookieCache: true },
        })
      )?.user.id,
    ).toBe(userID);
    const signup = await auth.handler(
      request("sign-up/email", {
        name: "Other",
        email: "other@example.invalid",
        password: "fixture-password-123",
      }),
    );
    expect(signup.status).toBe(400);
    expect(data.user).toHaveLength(1);
  });
});
