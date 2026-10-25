import { expect, it } from "vitest";
import { safeAuthReturnPath } from "./auth-errors";

it("preserves local account setup destinations and rejects external or executable returns", () => {
  expect(
    safeAuthReturnPath("/native/password?setup=1", "https://example.org"),
  ).toBe("/native/password?setup=1");
  for (const value of [
    null,
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "http://[",
  ]) {
    expect(safeAuthReturnPath(value, "https://example.org")).toBe("/");
  }
});
