import { marked } from "marked";

const HTML_TAG_PATTERN = /<\/?[a-z][\s\S]*?>/i;
const MARKDOWN_PATTERN =
  /(^|\n)#{1,6}\s|(^|\n)\s*[-*+]\s|(^|\n)\d+\.\s|\*\*|__|(^|\n)>\s|```|\s#{1,6}\s|\s\*\s+\S/m;

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

  const preprocessed = preprocessFlattenedMarkdown(trimmed);

  if (MARKDOWN_PATTERN.test(preprocessed)) {
    return marked.parse(preprocessed, { async: false });
  }

  return plainTextToHtml(preprocessed);
}

/**
 * Raycast AI often emits markdown on a single line, e.g.
 * "...generation: * Item * Item ### Heading Body text..."
 * Insert line breaks so marked can parse headings and lists.
 */
export function preprocessFlattenedMarkdown(text: string): string {
  let result = text.replace(/\r\n/g, "\n");

  result = splitInlineBullets(result);

  // "text ### Heading" -> "text\n\n### Heading"
  result = result.replace(/\s+(#{1,6}\s+)/g, "\n\n$1");

  result = result
    .split("\n")
    .map((line) => splitHeadingFromBody(line))
    .join("\n");

  return result.trim();
}

function splitInlineBullets(text: string): string {
  let result = text;
  let prev: string;

  do {
    prev = result;
    // Use horizontal whitespace only — \s would treat newlines as bullet separators.
    result = result.replace(/([.:!?])[ \t]+\*(?=[ \t])/g, "$1\n\n*");
    result = result.replace(/(\*[ \t][^*\n]+?)[ \t]+\*(?=[ \t])/g, "$1\n*");
    result = result.replace(/(\*[ \t][^\n#]+?)[ \t]+(#{1,6}[ \t])/g, "$1\n\n$2");
  } while (result !== prev);

  return result;
}

/** Split "### Title: subtitle Body paragraph" when heading and body share a line. */
function splitHeadingFromBody(line: string): string {
  if (!/^#{1,6}\s/.test(line)) return line;

  // Subtitle is short (2–5 words after the label). Body starts with a capital.
  const headingBodyPattern =
    /^(#{1,6}\s+[^:]+:\s+\S+(?:\s+\S+){1,4})\s+([A-Z].+)$/;
  const match = headingBodyPattern.exec(line);
  if (!match) return line;

  const [, heading, body] = match;
  if (!heading || !body) return line;

  return `${heading}\n\n${body}`;
}

function plainTextToHtml(text: string): string {
  // When blank lines separate paragraphs, honor them and keep single newlines
  // as <br> (soft wraps within a paragraph). When there are no blank lines at
  // all — common from AI output that puts one paragraph per line — treat every
  // newline as a paragraph break so the body doesn't collapse into one block.
  const hasParagraphBreaks = /\n{2,}/.test(text);
  const blocks = hasParagraphBreaks ? text.split(/\n{2,}/) : text.split(/\n/);

  return blocks
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const escaped = escapeHtml(block);
      const inner = hasParagraphBreaks ? escaped.replace(/\n/g, "<br>") : escaped;
      return `<p>${inner}</p>`;
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
