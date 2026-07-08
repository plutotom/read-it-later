import { describe, expect, it } from "vitest";
import {
  DOCUMENT_UNSUPPORTED_TTS_MESSAGE,
  getArticleContentKind,
  getDocumentExtractionStatus,
  hasExtractedText,
  isDocumentArticle,
  isPdfArticle,
} from "~/lib/article-content-kind";

describe("article-content-kind", () => {
  it("defaults to html when metadata is missing", () => {
    expect(getArticleContentKind(null)).toBe("html");
    expect(getArticleContentKind(undefined)).toBe("html");
    expect(isPdfArticle({})).toBe(false);
    expect(isDocumentArticle({})).toBe(false);
  });

  it("detects pdf articles from metadata", () => {
    expect(
      getArticleContentKind({
        contentKind: "pdf",
        siteName: "example.com",
      }),
    ).toBe("pdf");
    expect(
      isPdfArticle({
        metadata: { contentKind: "pdf" },
      }),
    ).toBe(true);
    expect(
      isDocumentArticle({
        metadata: { contentKind: "pdf" },
      }),
    ).toBe(true);
  });

  it("treats documents with complete extraction as having text", () => {
    expect(
      hasExtractedText({
        content: "short",
        metadata: { contentKind: "pdf", extractionStatus: "complete" },
      }),
    ).toBe(true);
  });

  it("requires substantial content when extraction status is absent", () => {
    expect(
      hasExtractedText({
        content: "tiny",
        metadata: { contentKind: "pdf" },
      }),
    ).toBe(false);
    expect(
      hasExtractedText({
        content: "x".repeat(60),
        metadata: { contentKind: "pdf" },
      }),
    ).toBe(true);
  });

  it("reads extraction status from metadata", () => {
    expect(
      getDocumentExtractionStatus({
        extractionStatus: "skipped",
      }),
    ).toBe("skipped");
  });

  it("uses document-specific TTS message", () => {
    expect(DOCUMENT_UNSUPPORTED_TTS_MESSAGE).toMatch(/text layer/i);
  });
});
