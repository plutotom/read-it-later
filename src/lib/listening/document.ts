import { hashAnchorText } from "~/lib/highlight-anchor";

export interface ListeningParagraph {
  index: number;
  start: number;
  end: number;
}
export interface ListeningSegment {
  index: number;
  paragraph: number;
  text: string;
  /** Each UTF-16 character maps to the unchanged article's textContent. */
  sourceOffsets: number[];
  estimatedDuration: number;
}
export interface ListeningDocument {
  revision: string;
  paragraphs: ListeningParagraph[];
  segments: ListeningSegment[];
  /** Exact normalized paragraphs before splitting; legacy DOM offsets stay unchanged. */
  canonical?: {
    text: string;
    sourceOffsets: number[];
    paragraphs: ListeningParagraph[];
    segments: Array<{
      index: number;
      paragraph: number;
      start: number;
      end: number;
      text: string;
    }>;
  };
}

const BLOCKS =
  "p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,td,th,figcaption,div,section,article";
const OMIT =
  "script,style,noscript,iframe,svg,button,[hidden],[aria-hidden='true']";
const MAX_CHARS = 900;

/**
 * The server and browser run this same algorithm against the article body.
 * Never rewrite HTML to attach speech positions: notes and selections share it.
 */
export function createListeningDocument(root: HTMLElement): ListeningDocument {
  const walker = root.ownerDocument.createTreeWalker(root, 1 | 4);
  const paragraphs: ListeningParagraph[] = [];
  const segments: ListeningSegment[] = [];
  let canonicalText = "";
  const canonicalOffsets: number[] = [];
  const canonicalParagraphs: ListeningParagraph[] = [];
  const canonicalSegments: Array<{
    index: number;
    paragraph: number;
    start: number;
    end: number;
    text: string;
  }> = [];
  let sourceOffset = 0;
  let owner: Element | null = null;
  let text = "";
  let offsets: number[] = [];
  const flush = () => {
    while (text.endsWith(" ")) {
      text = text.slice(0, -1);
      offsets.pop();
    }
    if (!text) return;
    const paragraph = paragraphs.length;
    if (canonicalText) {
      canonicalText += "\n\n";
      canonicalOffsets.push(-1, -1);
    }
    const canonicalStart = canonicalText.length;
    canonicalText += text;
    for (const offset of offsets) canonicalOffsets.push(offset);
    canonicalParagraphs.push({
      index: paragraph,
      start: canonicalStart,
      end: canonicalText.length,
    });
    paragraphs.push({
      index: paragraph,
      start: offsets[0]!,
      end: offsets.at(-1)! + 1,
    });
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + MAX_CHARS, text.length);
      if (end < text.length) {
        const window = text.slice(start, end);
        const sentence = [...window.matchAll(/[.!?。！？](?:\s|$)/gu)].at(-1);
        if (sentence && sentence.index > 150)
          end = start + sentence.index + sentence[0].length;
        else {
          const space = window.lastIndexOf(" ");
          if (space > 0) end = start + space;
          // Never split a Unicode surrogate pair, even in an enormous token.
          else if (/[\uD800-\uDBFF]/u.test(text[end - 1]!)) end--;
        }
      }
      const piece = text.slice(start, end).trimEnd();
      if (piece) {
        canonicalSegments.push({
          index: segments.length,
          paragraph,
          start: canonicalStart + start,
          end: canonicalStart + start + piece.length,
          text: piece,
        });
        segments.push({
          index: segments.length,
          paragraph,
          text: piece,
          sourceOffsets: offsets.slice(start, start + piece.length),
          estimatedDuration: Math.max(0.5, piece.split(/\s+/u).length / 2.8),
        });
      }
      start = end;
      while (text[start] === " ") start++;
    }
    text = "";
    offsets = [];
  };
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeType === 1) {
      const element = node as Element;
      if (element.tagName === "BR" && text && !text.endsWith(" ")) {
        text += " ";
        offsets.push(Math.max(0, sourceOffset - 1));
      }
      continue;
    }
    const value = node.textContent ?? "";
    const base = sourceOffset;
    sourceOffset += value.length;
    const parent = node.parentElement;
    if (!parent || parent.closest(OMIT)) continue;
    const block = parent.closest(BLOCKS) ?? root;
    if (owner !== block) {
      flush();
      owner = block;
    }
    for (let i = 0; i < value.length; i++) {
      const character = value[i]!;
      if (/\s/u.test(character)) {
        if (text && !text.endsWith(" ")) {
          text += " ";
          offsets.push(base + i);
        }
      } else {
        text += character;
        offsets.push(base + i);
      }
    }
  }
  flush();
  return {
    revision: hashAnchorText(
      JSON.stringify([
        1,
        root.textContent,
        segments.map((s) => [s.paragraph, s.text, s.sourceOffsets]),
      ]),
    ),
    paragraphs,
    segments,
    canonical: {
      text: canonicalText,
      sourceOffsets: canonicalOffsets,
      paragraphs: canonicalParagraphs,
      segments: canonicalSegments,
    },
  };
}

export function segmentAtSourceOffset(
  document: ListeningDocument,
  offset: number,
): number | undefined {
  const paragraph =
    offset < 0 ? undefined : document.paragraphs.find((p) => offset < p.end);
  return document.segments.find((s) => s.paragraph === paragraph?.index)?.index;
}

export function sourceRange(
  segment: ListeningSegment,
  offset: number,
  length: number,
) {
  const start = segment.sourceOffsets[offset];
  const last = segment.sourceOffsets[offset + length - 1];
  return start === undefined || last === undefined
    ? null
    : { start, end: last + 1 };
}
