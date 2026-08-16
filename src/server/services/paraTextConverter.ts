import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";

const STRIP_SELECTOR =
  "script, style, img, picture, figure, svg, video, audio, iframe, object, embed, nav, aside";

const BLOCK_TAGS = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "BLOCKQUOTE",
  "PRE",
  "HR",
  "TR",
  "DIV",
  "SECTION",
  "ARTICLE",
  "HEADER",
  "FOOTER",
  "MAIN",
  "UL",
  "OL",
  "TABLE",
  "THEAD",
  "TBODY",
  "TFOOT",
  "TD",
  "TH",
  "FIGCAPTION",
  "DT",
  "DD",
  "ADDRESS",
]);

export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function hashTxtContent(txt: string): string {
  return hashContent(txt);
}

/**
 * Fold punctuation to ASCII so the Heltec Helvetica `_te` font can draw it.
 * That font is ISO-8859-1; curly quotes, dashes, and ellipsis would otherwise
 * vanish at render time and glue neighboring words together.
 */
export function foldDeviceTypography(text: string): string {
  return text
    .replace(/\u00A0/g, " ")
    .replace(
      /[\u00AB\u00BB\u201C\u201D\u201E\u201F\u2039\u203A\u0093\u0094\u0084]/g,
      '"',
    )
    .replace(/[\u2018\u2019\u201A\u201B\u0091\u0092\u0082]/g, "'")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/\u2026/g, "...");
}

function normalizeInlineText(text: string): string {
  return foldDeviceTypography(text)
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collectInline(el: Element): string {
  let text = "";
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === child.TEXT_NODE) {
      text += child.textContent ?? "";
      continue;
    }
    if (child.nodeType !== child.ELEMENT_NODE) continue;
    const nested = child as Element;
    if (nested.tagName === "BR") {
      text += "\n";
      continue;
    }
    text += collectInline(nested);
    if (BLOCK_TAGS.has(nested.tagName)) text += "\n";
  }
  return text;
}

function extractBlockText(element: Element): string {
  const blocks: string[] = [];

  const flushInline = (inline: string) => {
    const text = normalizeInlineText(inline);
    if (text) blocks.push(text);
  };

  const walk = (el: Element) => {
    let inline = "";
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === child.TEXT_NODE) {
        inline += child.textContent ?? "";
        continue;
      }
      if (child.nodeType !== child.ELEMENT_NODE) continue;
      const nested = child as Element;
      if (nested.tagName === "BR") {
        inline += "\n";
        continue;
      }
      if (BLOCK_TAGS.has(nested.tagName)) {
        flushInline(inline);
        inline = "";
        walk(nested);
        continue;
      }
      inline += collectInline(nested);
    }
    flushInline(inline);
  };

  walk(element);
  return blocks
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function htmlToPlainText(html: string): string {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  const doc = dom.window.document;

  doc.querySelectorAll(STRIP_SELECTOR).forEach((el) => el.remove());

  return extractBlockText(doc.body);
}

export function formatParaTxt(title: string, html: string): string {
  const trimmedTitle = title.trim();
  const body = htmlToPlainText(html);

  if (!trimmedTitle) return body;
  if (body === trimmedTitle || body.startsWith(`${trimmedTitle}\n`)) {
    return body;
  }

  return `${trimmedTitle}\n${"=".repeat(trimmedTitle.length)}\n\n${body}`;
}

export function buildParaTxtFromArticle(
  title: string,
  html: string,
): {
  txtContent: string;
  bytes: number;
  sha256: string;
  contentHash: string;
} {
  const txtContent = formatParaTxt(title, html);
  const bytes = Buffer.byteLength(txtContent, "utf8");

  return {
    txtContent,
    bytes,
    sha256: hashTxtContent(txtContent),
    contentHash: hashContent(html),
  };
}
