import { describe, expect, it } from "vitest";
import { readNativeLibraryCursor, signNativeLibraryCursor } from "./cursor";

const secret = "synthetic-cursor-secret-at-least-thirty-two-characters";
describe("signed owner-bound native library cursors", () => {
  it("retains bigint precision and has an explicit initial cursor", () => {
    expect(readNativeLibraryCursor(undefined, "fixture-a", secret)).toBe("0");
    const token = signNativeLibraryCursor(
      "fixture-a",
      "9007199254740993",
      secret,
    );
    expect(readNativeLibraryCursor(token, "fixture-a", secret)).toBe(
      "9007199254740993",
    );
  });
  it("rejects other owners, tampering, empty cursors and malformed values", () => {
    const token = signNativeLibraryCursor("fixture-a", "12", secret);
    for (const candidate of ["", "12", token + "x", "x".repeat(3000)])
      expect(() =>
        readNativeLibraryCursor(candidate, "fixture-a", secret),
      ).toThrow("invalid_cursor");
    expect(() => readNativeLibraryCursor(token, "fixture-b", secret)).toThrow(
      "invalid_cursor",
    );
    expect(() =>
      readNativeLibraryCursor(token, "fixture-a", secret + "wrong"),
    ).toThrow("invalid_cursor");
    for (const value of ["-1", "01", "9223372036854775808"])
      expect(() =>
        readNativeLibraryCursor(
          signNativeLibraryCursor("fixture-a", value, secret),
          "fixture-a",
          secret,
        ),
      ).toThrow("invalid_cursor");
  });
});
