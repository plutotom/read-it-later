import { describe, expect, it } from "vitest";
import { slugifyHeading, uniqueHeadingId } from "./heading-slug";

describe("slugifyHeading", () => {
  it("slugifies heading text", () => {
    expect(slugifyHeading("Basic assumptions and framework")).toBe(
      "basic-assumptions-and-framework",
    );
  });

  it("returns section for empty text", () => {
    expect(slugifyHeading("   ")).toBe("section");
  });
});

describe("uniqueHeadingId", () => {
  it("deduplicates repeated headings", () => {
    const counts = new Map<string, number>();
    expect(uniqueHeadingId("Intro", counts)).toBe("intro");
    expect(uniqueHeadingId("Intro", counts)).toBe("intro-2");
    expect(uniqueHeadingId("Intro", counts)).toBe("intro-3");
  });
});
