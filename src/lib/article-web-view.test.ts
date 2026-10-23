import { describe, expect, it } from "vitest";
import { getArticleWebUrl } from "./article-web-view";

describe("original website URLs", () => {
  it("preserves article paths, query strings, and fragments", () => {
    const url = "https://example.com/interactive?view=chart#results";
    expect(getArticleWebUrl(url)).toBe(url);
    expect(getArticleWebUrl("http://example.com/article")).toBe(
      "http://example.com/article",
    );
  });

  it.each([
    "javascript:alert(document.cookie)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "blob:https://example.com/id",
    "/api/auth",
    "not a url",
    "https://user:password@example.com/article",
    "https://user@example.com/article",
  ])("rejects unsafe or non-web navigation: %s", (value) => {
    expect(getArticleWebUrl(value)).toBeNull();
  });
});
