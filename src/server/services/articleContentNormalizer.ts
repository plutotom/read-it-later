import { marked } from "marked";

const HTML_TAG_PATTERN = /<\/?[a-z][\s\S]*?>/i;
const MARKDOWN_PATTERN =
  /(^|\n)#{1,6}\s|(^|\n)\s*[-*+]\s|(^|\n)\d+\.\s|\*\*|__|(^|\n)>\s|```/m;

/**
 * Manual text entries should be stored as HTML for the reader. The web UI
 * submits Tiptap HTML; API clients and Raycast AI often send markdown or plain
 * text instead. Normalize on ingest so every surface renders correctly.
 */
export function normalizeManualArticleContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return trimmed;

  if (HTML_TAG_PATTERN.test(trimmed)) {
    return trimmed;
  }

  if (MARKDOWN_PATTERN.test(trimmed)) {
    return marked.parse(trimmed, { async: false }) as string;
  }

  return plainTextToHtml(trimmed);
}

function plainTextToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const withBreaks = escapeHtml(block).replace(/\n/g, "<br>");
      return `<p>${withBreaks}</p>`;
    })
    .join("\n");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
