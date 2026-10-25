import { expect, it } from "vitest";
import { resolveAuthBaseURL } from "./auth-origin";

it("builds without environment defaults when validation is skipped in CI", () => {
  expect(new URL(resolveAuthBaseURL({})).origin).toBe("http://localhost:4114");
});

it("keeps preview callbacks on the preview even with a shared production AUTH_URL", () => {
  expect(
    resolveAuthBaseURL({
      authURL: "https://production.example.invalid",
      vercelURL: "preview.example.invalid",
      vercelEnvironment: "preview",
    }),
  ).toBe("https://preview.example.invalid");
});

it("uses explicit production/local origins and otherwise the current deployment", () => {
  expect(resolveAuthBaseURL({ authURL: "http://localhost:4115" })).toBe(
    "http://localhost:4115",
  );
  expect(
    resolveAuthBaseURL({
      authURL: "https://production.example.invalid",
      vercelURL: "deployment.example.invalid",
      vercelEnvironment: "production",
    }),
  ).toBe("https://production.example.invalid");
  expect(resolveAuthBaseURL({ vercelURL: "deployment.example.invalid" })).toBe(
    "https://deployment.example.invalid",
  );
});
