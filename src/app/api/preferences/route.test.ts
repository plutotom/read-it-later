import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: vi.fn(),
  preferences: vi.fn(),
  hasPassword: vi.fn(),
  updateSet: vi.fn(),
  insertValues: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("~/server/auth", () => ({
  auth: { api: { getSession: state.session } },
}));
vi.mock("~/server/db", () => ({
  db: {
    query: { userPreferences: { findFirst: state.preferences } },
    update: () => ({
      set: (values: unknown) => {
        state.updateSet(values);
        return { where: async () => undefined };
      },
    }),
    insert: () => ({
      values: (values: unknown) => {
        state.insertValues(values);
      },
    }),
  },
}));
vi.mock("~/server/services/native-auth/password-status", () => ({
  hasAccountPassword: state.hasPassword,
}));

import { GET, POST } from "./route";

beforeEach(() => {
  state.session.mockReset().mockResolvedValue({ user: { id: "account-a" } });
  state.preferences.mockReset().mockResolvedValue(null);
  state.hasPassword.mockReset().mockResolvedValue(false);
  state.updateSet.mockReset();
  state.insertValues.mockReset();
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
    paraEnabled: true,
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
    paraEnabled: true,
    hasPassword: true,
  });
});

it("defaults paraEnabled to true when the setting is missing", async () => {
  state.preferences.mockResolvedValue({
    theme: "light",
    ttsVoiceName: "en-US-Standard-A",
    settings: {},
  });
  expect(await (await GET()).json()).toMatchObject({
    settings: {},
    paraEnabled: true,
  });
});

it("returns paraEnabled false when the stored setting is false", async () => {
  state.preferences.mockResolvedValue({
    theme: "light",
    ttsVoiceName: "en-US-Standard-A",
    settings: { paraEnabled: false, custom: true },
  });
  expect(await (await GET()).json()).toEqual({
    theme: "light",
    ttsVoiceName: "en-US-Standard-A",
    settings: { paraEnabled: false, custom: true },
    paraEnabled: false,
    hasPassword: false,
  });
});

it("merges paraEnabled into existing settings without replacing them", async () => {
  state.preferences.mockResolvedValue({
    theme: "dark",
    ttsVoiceName: "fixture-voice",
    settings: { custom: true },
  });
  const response = await POST(
    new Request("https://example.invalid/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paraEnabled: false }),
    }),
  );
  expect(response.status).toBe(200);
  expect(state.updateSet).toHaveBeenCalledWith({
    settings: { custom: true, paraEnabled: false },
  });
  expect(state.insertValues).not.toHaveBeenCalled();
});

it("keeps paraEnabled when only theme is saved", async () => {
  state.preferences.mockResolvedValue({
    theme: "light",
    ttsVoiceName: "en-US-Standard-A",
    settings: { paraEnabled: false, custom: true },
  });
  await POST(
    new Request("https://example.invalid/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: "dark" }),
    }),
  );
  expect(state.updateSet).toHaveBeenCalledWith({ theme: "dark" });
});

it("creates preferences with merged paraEnabled when none exist", async () => {
  await POST(
    new Request("https://example.invalid/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paraEnabled: false }),
    }),
  );
  expect(state.insertValues).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: "account-a",
      settings: { paraEnabled: false },
    }),
  );
  expect(state.updateSet).not.toHaveBeenCalled();
});
