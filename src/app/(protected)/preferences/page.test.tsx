// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  user: { id: "fixture-user", email: "fixture@example.invalid" },
}));
vi.mock("~/lib/auth-client", () => ({
  useSession: () => ({ data: session }),
}));
vi.mock("~/app/_components/layout", () => ({
  Layout: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("~/app/_components/tts-usage-display", () => ({
  TTSUsageDisplay: () => null,
}));
vi.mock("~/app/_components/voice-selector", () => ({
  VoiceSelector: () => null,
}));
vi.mock("~/app/_components/api-keys-settings", () => ({
  ApiKeysSettings: () => null,
}));

import PreferencesPage from "./page";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function mount(hasPassword: boolean | undefined) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ theme: "dark", hasPassword }),
    }),
  );
  await act(async () => root.render(<PreferencesPage />));
}

it("shows password status and a change action when a password exists", async () => {
  await mount(true);
  expect(container.textContent).toContain("Password is set.");
  expect(
    container.querySelector('a[href="/native/password"]')?.textContent,
  ).toBe("Change password");
});

it("shows a setup action when no password exists", async () => {
  await mount(false);
  expect(container.textContent).toContain("No password set.");
  expect(
    container.querySelector('a[href="/native/password"]')?.textContent,
  ).toBe("Set up password");
});

it("does not misreport an unknown status as a missing password", async () => {
  await mount(undefined);
  expect(container.textContent).toContain("Could not check password status.");
  expect(container.textContent).not.toContain("No password set.");
  expect(
    container.querySelector('a[href="/native/password"]')?.textContent,
  ).toBe("Manage password");
});
