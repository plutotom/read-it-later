import { describe, expect, it } from "vitest";
import { getDocumentSourceUrl } from "./document-source-url";

describe("getDocumentSourceUrl", () => {
  it("returns http(s) article URLs", () => {
    expect(
      getDocumentSourceUrl({
        url: "https://example.com/report.pdf",
        metadata: null,
      }),
    ).toBe("https://example.com/report.pdf");
  });

  it("prefers blobUrl from metadata when present", () => {
    expect(
      getDocumentSourceUrl({
        url: "https://example.com/report.pdf",
        metadata: { blobUrl: "https://blob.example/doc.pdf" },
      }),
    ).toBe("https://blob.example/doc.pdf");
  });

  it("rejects upload and text placeholder URLs", () => {
    expect(
      getDocumentSourceUrl({
        url: "upload://abc123",
        metadata: null,
      }),
    ).toBeNull();

    expect(
      getDocumentSourceUrl({
        url: "text://manual-abc",
        metadata: null,
      }),
    ).toBeNull();
  });

  it("rejects non-http URLs", () => {
    expect(
      getDocumentSourceUrl({
        url: "file:///tmp/report.pdf",
        metadata: null,
      }),
    ).toBeNull();
  });
});
