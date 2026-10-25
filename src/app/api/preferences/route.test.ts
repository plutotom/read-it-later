import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: vi.fn(),
  preferences: vi.fn(),
  hasPassword: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("~/server/auth", () => ({
  auth: { api: { getSession: state.session } },
}));
vi.mock("~/server/db", () => ({
  db: { query: { userPreferences: { findFirst: state.preferences } } },
}));
vi.mock("~/server/services/native-auth/password-status", () => ({
  hasAccountPassword: state.hasPassword,
}));

import { GET } from "./route";

beforeEach(() => {
  state.session.mockReset().mockResolvedValue({ user: { id: "account-a" } });
  state.preferences.mockReset().mockResolvedValue(null);
  state.hasPassword.mockReset().mockResolvedValue(false);
});

it("does not expose password status to anonymous requests", async () => {
  state.session.mockResolvedValue(null);
  expect((await GET()).status).toBe(401);
  expect(state.hasPassword).not.toHaveBeenCalled();
});

it("returns only a boolean for the signed-in account even without saved preferences", async () => {
  const response = await GET();
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual({
    theme: "light",
    ttsVoiceName: "en-US-Standard-A",
    settings: {},
    hasPassword: false,
  });
  expect(state.hasPassword).toHaveBeenCalledWith("account-a");
});

it("reports an existing password without altering saved preferences", async () => {
  state.hasPassword.mockResolvedValue(true);
  state.preferences.mockResolvedValue({
    theme: "dark",
    ttsVoiceName: "fixture-voice",
    settings: { custom: true },
  });
  expect(await (await GET()).json()).toEqual({
    theme: "dark",
    ttsVoiceName: "fixture-voice",
    settings: { custom: true },
    hasPassword: true,
  });
});
