/**
 * Chirp 3 HD markup preparation — pause tags at structural HTML boundaries.
 * @see https://cloud.google.com/text-to-speech/docs/chirp3-hd
 */

import { JSDOM } from "jsdom";
import { isChirp3Voice } from "~/lib/tts-voices";

const PAUSE_LONG = " [pause long]";
const PAUSE = " [pause]";

const LONG_PAUSE_TAGS = new Set(["P", "BLOCKQUOTE"]);
const SHORT_PAUSE_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "LI"]);
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);

// Chirp 3 splits text into "sentences" by terminal punctuation, not pause
// markup. Without it, headings/list items/paragraphs that lack a trailing
// period merge into one huge sentence and the API rejects the request.
const TERMINAL_PUNCTUATION = /[.!?…:;]$/;

/**
 * Whether Google TTS should receive `input.markup` instead of `input.text`.
 */
export function usesMarkupInput(voiceName: string): boolean {
  return isChirp3Voice(voiceName);
}

/**
 * Convert article HTML to Chirp 3 markup with mixed pause tags.
 */
export function htmlToChirpMarkup(html: string): string {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  document
    .querySelectorAll("script, style, noscript")
    .forEach((el) => el.remove());

  const body = document.body;
  if (!body) {
    return "";
  }

  const parts: string[] = [];
  walkChildren(body, parts);
  return normalizeMarkupWhitespace(parts.join(""));
}

function walkChildren(parent: Node, parts: string[]): void {
  for (const child of Array.from(parent.childNodes)) {
    walkNode(child, parts);
  }
}

function walkNode(node: Node, parts: string[]): void {
  if (node.nodeType === node.TEXT_NODE) {
    const text = node.textContent ?? "";
    if (text.trim()) {
      parts.push(text);
    }
    return;
  }

  if (node.nodeType !== node.ELEMENT_NODE) {
    return;
  }

  const el = node as Element;
  const tag = el.tagName;

  if (SKIP_TAGS.has(tag)) {
    return;
  }

  if (tag === "BR") {
    ensureSentenceEnd(parts);
    parts.push(PAUSE);
    return;
  }

  walkChildren(el, parts);

  if (LONG_PAUSE_TAGS.has(tag)) {
    ensureSentenceEnd(parts);
    parts.push(PAUSE_LONG);
  } else if (SHORT_PAUSE_TAGS.has(tag)) {
    ensureSentenceEnd(parts);
    parts.push(PAUSE);
  }
}

/**
 * Append a period before a structural pause when the preceding spoken text
 * doesn't already end in terminal punctuation, so Chirp 3 sees a sentence
 * boundary rather than one ever-growing sentence.
 */
function ensureSentenceEnd(parts: string[]): void {
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]!;
    // Skip pause tokens already emitted for nested elements.
    if (part === PAUSE || part === PAUSE_LONG) {
      continue;
    }
    const trimmed = part.replace(/\s+$/, "");
    if (!trimmed) {
      continue;
    }
    if (!TERMINAL_PUNCTUATION.test(trimmed)) {
      parts.push(".");
    }
    return;
  }
}

/**
 * Collapse whitespace while preserving pause markup tokens.
 */
export function normalizeMarkupWhitespace(text: string): string {
  const longPlaceholder = "\uE000PAUSE_LONG\uE001";
  const shortPlaceholder = "\uE000PAUSE\uE001";

  let normalized = text
    .replace(/\[pause long\]/gi, longPlaceholder)
    .replace(/\[pause\]/gi, shortPlaceholder)
    .replace(/\s+/g, " ")
    .trim();

  normalized = normalized
    .replace(/\s*\uE000PAUSE_LONG\uE001/g, PAUSE_LONG)
    .replace(/\s*\uE000PAUSE\uE001/g, PAUSE);

  // Collapse consecutive pause tokens (e.g. from empty elements) into a single
  // pause, preferring the longer one. Long runs garble Chirp 3 output.
  normalized = normalized.replace(/(?:\s*\[pause(?: long)?\])+/gi, (match) =>
    /long/i.test(match) ? PAUSE_LONG : PAUSE,
  );

  return normalized.replace(/\s{2,}/g, " ").trim();
}
