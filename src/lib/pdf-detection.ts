/**
 * Detect PDF responses before they are mis-parsed as HTML.
 */

const PDF_MAGIC = "%PDF-";

export function isPdfContentType(
  contentType: string | null | undefined,
): boolean {
  if (!contentType) return false;
  const mime = contentType.toLowerCase().split(";")[0]?.trim();
  return mime === "application/pdf" || mime === "application/x-pdf";
}

export function isPdfUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith(".pdf");
  } catch {
    return false;
  }
}

export function isPdfBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < PDF_MAGIC.length) return false;
  const bytes = new Uint8Array(buffer, 0, PDF_MAGIC.length);
  const header = String.fromCharCode(...bytes);
  return header === PDF_MAGIC;
}

function looksLikeHtml(buffer: ArrayBuffer): boolean {
  const sample = new TextDecoder("utf-8", { fatal: false })
    .decode(buffer.slice(0, 256))
    .trimStart()
    .toLowerCase();
  return (
    sample.startsWith("<!doctype") ||
    sample.startsWith("<html") ||
    sample.startsWith("<?xml")
  );
}

/**
 * Returns true when the fetched response should be treated as a PDF document.
 */
export function detectPdfResponse(
  url: string,
  contentType: string | null | undefined,
  body: ArrayBuffer,
): boolean {
  if (isPdfBuffer(body)) return true;
  if (isPdfContentType(contentType)) return true;
  if (isPdfUrl(url) && !looksLikeHtml(body)) return true;
  return false;
}

export function titleFromPdfUrl(url: string): string {
  const urlObj = new URL(url);
  const filename = decodeURIComponent(
    urlObj.pathname.split("/").pop() ?? "",
  ).trim();

  if (!filename) {
    return `PDF from ${urlObj.hostname}`;
  }

  const withoutExtension = filename.replace(/\.pdf$/i, "").trim();
  if (!withoutExtension) {
    return filename;
  }

  return withoutExtension.replace(/[-_]+/g, " ").trim() || filename;
}
