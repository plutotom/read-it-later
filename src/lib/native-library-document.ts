import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import { createListeningDocument } from "~/lib/listening/document";

export const NATIVE_LIBRARY_FORMAT = "paper-drive-text-v1" as const;

/** Canonical offsets and listening segment identities come from one parser. */
export function createNativeLibraryDocument(root: HTMLElement) {
  const listening = createListeningDocument(root);
  if (!listening.canonical) {
    throw new Error("Listening document canonical mapping is required");
  }
  // Do not concatenate speech segments: splitting trims boundary spaces.
  const canonical = listening.canonical;
  return {
    ...canonical,
    format: NATIVE_LIBRARY_FORMAT,
    contentHash: createHash("sha256")
      .update(canonical.text, "utf8")
      .digest("hex"),
    revision: listening.revision,
  };
}

export function nativeLibraryDocumentFromHtml(html: string) {
  // Scripts and resource fetching are disabled by JSDOM's default options.
  const dom = new JSDOM("<!doctype html><body></body>");
  try {
    dom.window.document.body.innerHTML = html;
    return createNativeLibraryDocument(dom.window.document.body);
  } finally {
    dom.window.close();
  }
}

/** Native extraction is text, never trusted HTML. No publisher fetch occurs. */
export function nativeLibraryTextToHtml(text: string) {
  const escaped = text.replace(/[&<>"']/gu, (character) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character]!;
  });
  return escaped
    .split(/\r\n|\r|\n/gu)
    .map((paragraph) => `<p>${paragraph}</p>`)
    .join("");
}
