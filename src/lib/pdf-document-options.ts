/**
 * PDF.js needs these asset paths for JPEG2000 images, CJK text, and legacy fonts.
 * Assets are copied to public/pdfjs/ by scripts/copy-pdfjs-assets.mjs (postinstall).
 */
export const pdfDocumentOptions = {
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  wasmUrl: "/pdfjs/wasm/",
} as const;

export const pdfWorkerSrc = "/pdfjs/pdf.worker.min.mjs";
