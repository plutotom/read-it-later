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
]);

export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function hashTxtContent(txt: string): string {
  return hashContent(txt);
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function extractBlockText(element: Element): string {
  const parts: string[] = [];

  const walk = (node: Node) => {
    if (node.nodeType === node.TEXT_NODE) {
      const text = normalizeWhitespace(node.textContent ?? "");
      if (text) parts.push(text);
      return;
    }

    if (node.nodeType !== node.ELEMENT_NODE) return;

    const el = node as Element;
    const tag = el.tagName;

    if (tag === "BR") {
      parts.push("\n");
      return;
    }

    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock && parts.length > 0 && parts[parts.length - 1] !== "\n") {
      parts.push("\n");
    }

    for (const child of el.childNodes) {
      walk(child);
    }

    if (isBlock) {
      parts.push("\n\n");
    }
  };

  walk(element);

  return parts
    .join("")
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
