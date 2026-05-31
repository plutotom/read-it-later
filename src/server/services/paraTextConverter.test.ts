import { describe, expect, it } from "vitest";
import {
  buildParaTxtFromArticle,
  formatParaTxt,
  htmlToPlainText,
} from "~/server/services/paraTextConverter";
import {
  MAX_PARA_FILENAME_BYTES,
  resolveUniqueFilename,
  sanitizeTxtFilename,
} from "~/server/lib/paraFilename";

describe("paraTextConverter", () => {
  it("strips images and scripts from HTML", () => {
    const html = `
      <p>Hello world</p>
      <img src="photo.jpg" alt="photo" />
      <script>alert('x')</script>
      <p>Second paragraph</p>
    `;

    expect(htmlToPlainText(html)).toBe("Hello world\n\nSecond paragraph");
  });

  it("formats title with underline separator", () => {
    const result = formatParaTxt("My Article", "<p>Body text</p>");
    expect(result).toBe("My Article\n==========\n\nBody text");
  });

  it("computes bytes and hashes", () => {
    const result = buildParaTxtFromArticle("Title", "<p>Body</p>");
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.sha256).toHaveLength(64);
    expect(result.contentHash).toHaveLength(64);
  });
});

describe("paraFilename", () => {
  it("slugifies titles to txt filenames", () => {
    expect(sanitizeTxtFilename("Hello World!")).toBe("hello-world.txt");
  });

  it("keeps filenames within the firmware temp-path budget", () => {
    const filename = sanitizeTxtFilename("A".repeat(200));
    expect(filename.length).toBeLessThanOrEqual(MAX_PARA_FILENAME_BYTES);
    expect(`/books/${filename}.tmp`.length).toBeLessThanOrEqual(95);
  });

  it("resolves filename collisions", () => {
    const taken = new Set(["hello-world.txt"]);
    expect(resolveUniqueFilename("hello-world.txt", taken)).toBe(
      "hello-world-2.txt",
    );
  });

  it("preserves the collision suffix within the firmware path budget", () => {
    const filename = sanitizeTxtFilename("Long ".repeat(60));
    const taken = new Set([filename]);
    const collision = resolveUniqueFilename(filename, taken);

    expect(collision).toMatch(/-2\.txt$/);
    expect(collision.length).toBeLessThanOrEqual(MAX_PARA_FILENAME_BYTES);
    expect(`/books/${collision}.tmp`.length).toBeLessThanOrEqual(95);
  });
});
