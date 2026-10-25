import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  origin: "https://auth.example.invalid",
  getSession: vi.fn(),
  setPassword: vi.fn(),
  changePassword: vi.fn(),
  allow: vi.fn(),
  hasPassword: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ Origin: state.origin }),
}));
vi.mock("~/server/auth", () => ({
  auth: {
    $context: Promise.resolve({
      trustedOrigins: ["https://auth.example.invalid"],
    }),
    api: {
      getSession: state.getSession,
      setPassword: state.setPassword,
      changePassword: state.changePassword,
    },
  },
}));
vi.mock("~/server/services/native-auth/rate-limit", () => ({
  allowAuthAttempt: state.allow,
}));
vi.mock("~/server/services/native-auth/password-status", () => ({
  hasAccountPassword: state.hasPassword,
}));
import { saveNativePassword } from "./actions";

beforeEach(() => {
  state.origin = "https://auth.example.invalid";
  state.getSession.mockReset().mockResolvedValue({
    user: { id: "account-a" },
    session: { createdAt: new Date() },
  });
  state.setPassword.mockReset().mockResolvedValue({ status: true });
  state.changePassword
    .mockReset()
    .mockResolvedValue({ token: "must-not-return" });
  state.allow.mockReset().mockResolvedValue(true);
  state.hasPassword.mockReset().mockResolvedValue(false);
});

it("requires a fresh authenticated identity and refuses cross-origin enrollment", async () => {
  state.getSession.mockResolvedValueOnce(null);
  expect(
    await saveNativePassword({ newPassword: "fixture-password-123" }),
  ).toMatchObject({ error: "Sign in with Discord first." });
  state.getSession.mockResolvedValueOnce({
    user: { id: "account-a" },
    session: { createdAt: new Date(Date.now() - 11 * 60_000) },
  });
  expect(
    await saveNativePassword({ newPassword: "fixture-password-123" }),
  ).toMatchObject({ reauthenticate: true });
  state.origin = "https://other.vercel.app";
  expect(
    await saveNativePassword({ newPassword: "fixture-password-123" }),
  ).toHaveProperty("error");
  expect(state.setPassword).not.toHaveBeenCalled();
});

it("enrolls only the authenticated account and never accepts an input user ID", async () => {
  await expect(
    saveNativePassword({
      newPassword: "fixture-password-123",
      userId: "account-b",
    }),
  ).resolves.toEqual({ success: true });
  expect(state.allow).toHaveBeenCalledWith("password-setup:account-a", 3);
  expect(state.setPassword).toHaveBeenCalledWith({
    headers: new Headers({ Origin: "https://auth.example.invalid" }),
    body: { newPassword: "fixture-password-123" },
  });
});

it("requires the old password when changing one and revokes other sessions", async () => {
  state.hasPassword.mockResolvedValue(true);
  await expect(
    saveNativePassword({
      newPassword: "fixture-password-123",
      currentPassword: "old-fixture",
    }),
  ).resolves.toEqual({ success: true });
  expect(state.changePassword).toHaveBeenCalledWith({
    headers: new Headers({ Origin: "https://auth.example.invalid" }),
    body: {
      currentPassword: "old-fixture",
      newPassword: "fixture-password-123",
      revokeOtherSessions: true,
    },
  });
});

it("uses server password status instead of trusting the form to select enrollment", async () => {
  state.hasPassword.mockResolvedValue(true);
  const result = await saveNativePassword({
    newPassword: "fixture-password-123",
  });
  expect(result.error).toContain("already has a password");
  expect(state.hasPassword).toHaveBeenCalledWith("account-a");
  expect(state.setPassword).not.toHaveBeenCalled();
  expect(state.changePassword).not.toHaveBeenCalled();
});

it("rejects weak passwords and throttled enrollment without hashing", async () => {
  expect(await saveNativePassword({ newPassword: "short" })).toHaveProperty(
    "error",
  );
  state.allow.mockResolvedValue(false);
  expect(
    await saveNativePassword({ newPassword: "fixture-password-123" }),
  ).toHaveProperty("error");
  expect(state.setPassword).not.toHaveBeenCalled();
});
