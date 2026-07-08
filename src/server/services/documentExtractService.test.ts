import { describe, expect, it } from "vitest";
import {
  extractDocument,
  PASSWORD_PROTECTED_MESSAGE,
} from "~/server/services/documentExtractService";
import type { DocumentExtractionError } from "~/server/services/documentExtractService";

/** Minimal valid PDF with extractable text (Type1 Helvetica). */
function createMinimalTextPdf(): Buffer {
  const text =
    "Hello PDF. This sample document contains enough plain text for extraction.";
  const contentStream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${contentStream.length}>>stream
${contentStream}
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000052 00000 n 
0000000101 00000 n 
0000000229 00000 n 
0000000400 00000 n 
trailer<</Size 6/Root 1 0 R>>
startxref
471
%%EOF`;
  return Buffer.from(pdf, "utf8");
}

/** PDF with no extractable text (empty content stream). */
function createEmptyTextPdf(): Buffer {
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]/Contents 4 0 R>>endobj
4 0 obj<</Length 0>>stream
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000052 00000 n 
0000000101 00000 n 
0000000190 00000 n 
trailer<</Size 5/Root 1 0 R>>
startxref
241
%%EOF`;
  return Buffer.from(pdf, "utf8");
}

describe("documentExtractService", () => {
  it("extracts per-page text from a minimal PDF", async () => {
    const result = await extractDocument(createMinimalTextPdf(), "pdf");

    expect(result.plainText).toContain("Hello PDF");
    expect(result.hasTextLayer).toBe(true);
    expect(result.pageCount).toBe(1);
  });

  it("marks scanned or empty PDFs as having no text layer", async () => {
    const result = await extractDocument(createEmptyTextPdf(), "pdf");

    expect(result.plainText.trim()).toBe("");
    expect(result.hasTextLayer).toBe(false);
    expect(result.pageCount).toBe(1);
  });

  it("rejects corrupt PDF buffers", async () => {
    await expect(
      extractDocument(Buffer.from("not a pdf"), "pdf"),
    ).rejects.toMatchObject({
      name: "DocumentExtractionError",
      code: "corrupt",
    } satisfies Partial<DocumentExtractionError>);
  });

  it("rejects EPUB extraction in phase 2", async () => {
    await expect(
      extractDocument(Buffer.from("PK"), "epub"),
    ).rejects.toMatchObject({
      name: "DocumentExtractionError",
      code: "unsupported",
    } satisfies Partial<DocumentExtractionError>);
  });

  it("exposes a clear password-protected error message", () => {
    expect(PASSWORD_PROTECTED_MESSAGE).toMatch(/password/i);
  });
});
