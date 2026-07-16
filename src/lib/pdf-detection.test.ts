/**
 * Tests for PDF response detection helpers.
 */

import { describe, expect, it } from "vitest";
import {
  detectPdfResponse,
  isPdfBuffer,
  isPdfContentType,
  isPdfUrl,
  titleFromPdfUrl,
} from "~/lib/pdf-detection";

function toBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

describe("isPdfContentType", () => {
  it("detects application/pdf", () => {
    expect(isPdfContentType("application/pdf")).toBe(true);
    expect(isPdfContentType("application/pdf; charset=binary")).toBe(true);
  });

  it("rejects non-pdf types", () => {
    expect(isPdfContentType("text/html")).toBe(false);
    expect(isPdfContentType(null)).toBe(false);
  });
});

describe("isPdfUrl", () => {
  it("detects .pdf paths", () => {
    expect(isPdfUrl("https://example.com/report.pdf")).toBe(true);
    expect(isPdfUrl("https://example.com/report.PDF")).toBe(true);
  });

  it("rejects non-pdf paths", () => {
    expect(isPdfUrl("https://example.com/article")).toBe(false);
  });
});

describe("isPdfBuffer", () => {
  it("detects %PDF- magic bytes", () => {
    expect(isPdfBuffer(toBuffer("%PDF-1.4\n"))).toBe(true);
  });

  it("rejects html bodies", () => {
    expect(isPdfBuffer(toBuffer("<!DOCTYPE html><html></html>"))).toBe(false);
  });
});

describe("detectPdfResponse", () => {
  it("detects by magic bytes even with wrong content-type", () => {
    expect(
      detectPdfResponse(
        "https://example.com/file",
        "application/octet-stream",
        toBuffer("%PDF-1.7"),
      ),
    ).toBe(true);
  });

  it("detects by content-type", () => {
    expect(
      detectPdfResponse(
        "https://example.com/download",
        "application/pdf",
        toBuffer(""),
      ),
    ).toBe(true);
  });

  it("detects .pdf urls that are not html error pages", () => {
    expect(
      detectPdfResponse("https://example.com/paper.pdf", null, toBuffer("")),
    ).toBe(true);
  });

  it("does not treat html error pages at .pdf urls as pdfs", () => {
    expect(
      detectPdfResponse(
        "https://example.com/missing.pdf",
        "text/html",
        toBuffer("<!DOCTYPE html><html><body>Not found</body></html>"),
      ),
    ).toBe(false);
  });

  it("does not treat normal html articles as pdfs", () => {
    expect(
      detectPdfResponse(
        "https://example.com/blog/post",
        "text/html; charset=utf-8",
        toBuffer("<!DOCTYPE html><html><body><p>Hello</p></body></html>"),
      ),
    ).toBe(false);
  });
});

describe("titleFromPdfUrl", () => {
  it("derives a readable title from the filename", () => {
    expect(
      titleFromPdfUrl("https://example.com/papers/annual-report-2024.pdf"),
    ).toBe("annual report 2024");
  });

  it("falls back to hostname when no filename", () => {
    expect(titleFromPdfUrl("https://example.com/")).toBe(
      "PDF from example.com",
    );
  });
});
