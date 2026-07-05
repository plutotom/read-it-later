import { extractText, getDocumentProxy } from "unpdf";

export class DocumentExtractionError extends Error {
  constructor(
    message: string,
    public readonly code: "password" | "corrupt" | "unsupported",
  ) {
    super(message);
    this.name = "DocumentExtractionError";
  }
}

export interface DocumentExtractionResult {
  title?: string;
  author?: string;
  language?: string;
  plainText: string;
  pageCount?: number;
  chapterCount?: number;
  toc?: Array<{ title: string; href: string }>;
  hasTextLayer: boolean;
}

const PASSWORD_PROTECTED_MESSAGE =
  "This PDF is password-protected. Remove the password and try again.";
const CORRUPT_PDF_MESSAGE =
  "Could not read this PDF. The file may be corrupt or unsupported.";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function isPasswordProtectedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { name?: string; code?: number };
  if (record.name === "PasswordException") return true;
  return /password/i.test(errorMessage(error));
}

function readMetadataString(
  value: unknown,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function extractPdfMetadata(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
): Promise<Pick<DocumentExtractionResult, "title" | "author" | "language">> {
  try {
    const metadata = await pdf.getMetadata();
    const info = metadata?.info as Record<string, unknown> | undefined;
    return {
      title: readMetadataString(info?.Title),
      author: readMetadataString(info?.Author),
      language: readMetadataString(info?.Language),
    };
  } catch {
    return {};
  }
}

export async function extractDocument(
  buffer: Buffer,
  kind: "pdf" | "epub",
): Promise<DocumentExtractionResult> {
  if (kind === "epub") {
    throw new DocumentExtractionError(
      "EPUB extraction is not supported yet.",
      "unsupported",
    );
  }

  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const metadata = await extractPdfMetadata(pdf);
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pageTexts = Array.isArray(text) ? text : [text];
    const plainText = pageTexts.join("\n\n");
    const hasTextLayer = plainText.trim().length > 50;

    return {
      ...metadata,
      plainText,
      pageCount: totalPages,
      hasTextLayer,
    };
  } catch (error) {
    if (error instanceof DocumentExtractionError) {
      throw error;
    }

    if (isPasswordProtectedError(error)) {
      throw new DocumentExtractionError(
        PASSWORD_PROTECTED_MESSAGE,
        "password",
      );
    }

    throw new DocumentExtractionError(CORRUPT_PDF_MESSAGE, "corrupt");
  }
}

export {
  CORRUPT_PDF_MESSAGE,
  PASSWORD_PROTECTED_MESSAGE,
};
