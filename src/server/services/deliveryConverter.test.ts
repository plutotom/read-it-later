import { describe, expect, it } from "vitest";
import {
  buildKindleHtmlDocument,
  sanitizeDeliveryFilename,
} from "~/server/services/deliveryConverter";
import {
  buildSenderEmail,
  isValidKindleEmail,
} from "~/lib/kindleConstants";

describe("kindleConstants", () => {
  it("accepts common Kindle email formats", () => {
    expect(isValidKindleEmail("jane@kindle.com")).toBe(true);
    expect(isValidKindleEmail("jane@free.kindle.com")).toBe(true);
  });

  it("rejects non-Kindle addresses", () => {
    expect(isValidKindleEmail("jane@gmail.com")).toBe(false);
    expect(isValidKindleEmail("not-an-email")).toBe(false);
  });

  it("builds per-user sender addresses", () => {
    expect(buildSenderEmail("abc12345", "mail.example.com")).toBe(
      "kindle_delivery_abc12345@mail.example.com",
    );
  });
});

describe("deliveryConverter", () => {
  it("sanitizes filenames for attachments", () => {
    expect(sanitizeDeliveryFilename("Hello World!")).toBe("hello-world.html");
    expect(sanitizeDeliveryFilename("")).toBe("article.html");
  });

  it("wraps article HTML in a Kindle-friendly document", () => {
    const result = buildKindleHtmlDocument({
      title: "Test Article",
      author: "Ada",
      url: "https://example.com/post",
      contentHtml: "<p>Body text</p>",
    });

    expect(result.html).toContain("<h1>Test Article</h1>");
    expect(result.html).toContain("Ada");
    expect(result.html).toContain("<p>Body text</p>");
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.contentHash).toHaveLength(64);
  });

  it("escapes unsafe HTML in metadata", () => {
    const result = buildKindleHtmlDocument({
      title: '<script>alert("x")</script>',
      url: "https://example.com",
      contentHtml: "<p>Safe</p>",
    });

    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
  });
});
