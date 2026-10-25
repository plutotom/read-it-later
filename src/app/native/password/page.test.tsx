import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({
  getSession: vi.fn(),
  providers: [{ id: "discord" }],
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("~/server/auth", () => ({
  auth: {
    api: { getSession: state.getSession },
    $context: Promise.resolve({ socialProviders: state.providers }),
  },
}));
vi.mock("~/lib/auth-client", () => ({ authClient: {} }));
vi.mock("./actions", () => ({ saveNativePassword: vi.fn() }));

import NativePasswordPage from "./page";

beforeEach(() => {
  state.getSession.mockReset();
  state.providers.splice(0, state.providers.length, { id: "discord" });
});

async function renderPage(age: number | null) {
  state.getSession.mockResolvedValue(
    age === null
      ? null
      : {
          user: { email: "fixture@example.invalid" },
          session: { createdAt: new Date(Date.now() - age) },
        },
  );
  return renderToStaticMarkup(
    await NativePasswordPage({ searchParams: Promise.resolve({}) }),
  );
}

it("requires Discord confirmation before an old session can see password fields", async () => {
  const html = await renderPage(11 * 60_000);
  expect(html).toContain("Confirm your identity with Discord");
  expect(html).toContain("Continue with Discord");
  expect(html).not.toContain('type="password"');
  expect(state.getSession).toHaveBeenCalledWith({
    headers: new Headers(),
    query: { disableCookieCache: true },
  });
});

it("shows password fields after a fresh sign-in", async () => {
  const html = await renderPage(60_000);
  expect(html).toContain("New password");
  expect(html).toContain("Confirm password");
  expect(html).not.toContain("Continue with Discord");
});

it("requires sign-in before an unauthenticated visitor sees password fields", async () => {
  const html = await renderPage(null);
  expect(html).toContain("Continue with Discord");
  expect(html).not.toContain('type="password"');
});

it("keeps the form hidden when a stale session cannot reauthenticate", async () => {
  state.providers.splice(0);
  const html = await renderPage(11 * 60_000);
  expect(html).toContain("Discord sign-in is temporarily unavailable");
  expect(html).not.toContain('type="password"');
});
