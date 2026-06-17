import { describe, expect, it } from "vitest";
import { scopesSatisfy } from "~/server/lib/apiAuth";
import {
  PARA_READ_SCOPE,
  READ_ONLY_SCOPES,
  READ_WRITE_SCOPES,
  RIL_READ_SCOPE,
  RIL_WRITE_SCOPE,
} from "~/lib/paraConstants";

describe("scopesSatisfy", () => {
  it("matches an exactly granted scope", () => {
    expect(scopesSatisfy([RIL_READ_SCOPE], RIL_READ_SCOPE)).toBe(true);
    expect(scopesSatisfy([RIL_WRITE_SCOPE], RIL_WRITE_SCOPE)).toBe(true);
  });

  it("treats write as implying read", () => {
    expect(scopesSatisfy([RIL_WRITE_SCOPE], RIL_READ_SCOPE)).toBe(true);
  });

  it("does not treat read as implying write", () => {
    expect(scopesSatisfy([RIL_READ_SCOPE], RIL_WRITE_SCOPE)).toBe(false);
  });

  it("read-only keys can read but not write", () => {
    const scopes = [...READ_ONLY_SCOPES];
    expect(scopesSatisfy(scopes, RIL_READ_SCOPE)).toBe(true);
    expect(scopesSatisfy(scopes, RIL_WRITE_SCOPE)).toBe(false);
  });

  it("read+write keys can read and write", () => {
    const scopes = [...READ_WRITE_SCOPES];
    expect(scopesSatisfy(scopes, RIL_READ_SCOPE)).toBe(true);
    expect(scopesSatisfy(scopes, RIL_WRITE_SCOPE)).toBe(true);
  });

  it("legacy para:read-only keys do not satisfy ril scopes", () => {
    expect(scopesSatisfy([PARA_READ_SCOPE], RIL_READ_SCOPE)).toBe(false);
    expect(scopesSatisfy([PARA_READ_SCOPE], RIL_WRITE_SCOPE)).toBe(false);
  });

  it("both access levels still carry para:read for the e-reader", () => {
    expect(scopesSatisfy([...READ_ONLY_SCOPES], PARA_READ_SCOPE)).toBe(true);
    expect(scopesSatisfy([...READ_WRITE_SCOPES], PARA_READ_SCOPE)).toBe(true);
  });
});
