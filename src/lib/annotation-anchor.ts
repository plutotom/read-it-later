import { extractContext, hashAnchorText } from "./highlight-anchor";
import {
  sourceAnchorSchema,
  type SourceAnchor,
  type CanonicalAnchor,
} from "./native-annotations";

/** Produced by createNativeLibraryDocument, never by concatenating segments. */
export interface WebAnchor {
  text: string;
  startOffset: number;
  endOffset: number;
  contentHash: string;
  contextPrefix?: string;
  contextSuffix?: string;
}
export interface AnnotationDocument {
  text: string;
  contentHash: string;
  sourceOffsets: number[];
}
export function isUTF16Boundary(text: string, offset: number) {
  return (
    Number.isInteger(offset) &&
    offset >= 0 &&
    offset <= text.length &&
    !(
      offset > 0 &&
      offset < text.length &&
      /[\uD800-\uDBFF]/u.test(text[offset - 1]!) &&
      /[\uDC00-\uDFFF]/u.test(text[offset]!)
    )
  );
}
function exactRange(text: string, start: number, end: number, quote: string) {
  return (
    end > start &&
    isUTF16Boundary(text, start) &&
    isUTF16Boundary(text, end) &&
    text.slice(start, end) === quote
  );
}

/** Legacy recovery must be unique. Context can disambiguate, never pick a tie. */
function uniqueWebRange(
  domText: string,
  source: SourceAnchor,
  domHash: string,
) {
  if (
    source.contentHash === domHash &&
    exactRange(domText, source.startOffset, source.endOffset, source.text)
  )
    return { start: source.startOffset, end: source.endOffset };
  if (!source.text) return null;
  const matches: number[] = [];
  for (let from = 0; from <= domText.length; ) {
    const start = domText.indexOf(source.text, from);
    if (start < 0) break;
    matches.push(start);
    from = start + 1;
  }
  const contextual = matches.filter(
    (start) =>
      domText.slice(Math.max(0, start - source.contextPrefix.length), start) ===
        source.contextPrefix &&
      domText.slice(
        start + source.text.length,
        start + source.text.length + source.contextSuffix.length,
      ) === source.contextSuffix,
  );
  const candidates = contextual.length === 1 ? contextual : matches;
  if (candidates.length !== 1) return null;
  const start = candidates[0]!;
  return exactRange(domText, start, start + source.text.length, source.text)
    ? { start, end: start + source.text.length }
    : null;
}

/** Prove a bijection for every UTF-16 character. sourceOffsets alone is not invertible. */
function roundTrip(
  document: AnnotationDocument,
  domText: string,
  start: number,
  end: number,
  sourceIndices: Map<number, number>,
) {
  if (!exactRange(document.text, start, end, document.text.slice(start, end)))
    return null;
  const sourceStart = document.sourceOffsets[start];
  if (sourceStart === undefined || sourceStart < 0) return null;
  for (let i = start; i < end; i++) {
    const offset = document.sourceOffsets[i];
    if (
      offset !== sourceStart + i - start ||
      sourceIndices.get(offset) !== i ||
      document.text[i] !== domText[offset]
    )
      return null;
  }
  const sourceEnd = sourceStart + end - start;
  return exactRange(
    domText,
    sourceStart,
    sourceEnd,
    document.text.slice(start, end),
  )
    ? { start: sourceStart, end: sourceEnd }
    : null;
}
function webAnchor(
  domText: string,
  range: { start: number; end: number },
  domHash: string,
): WebAnchor {
  return {
    text: domText.slice(range.start, range.end),
    startOffset: range.start,
    endOffset: range.end,
    ...extractContext(domText, range.start, range.end),
    contentHash: domHash,
  };
}

export interface AnnotationProjection {
  canonicalAnchor: CanonicalAnchor | null;
  webAnchor: WebAnchor | null;
  resolution: "anchored" | "unresolved";
}

/** Index once per immutable article snapshot, rather than once per highlight. */
export function createAnnotationProjector(
  document: AnnotationDocument,
  domText: string,
) {
  const sourceIndices = new Map<number, number>();
  document.sourceOffsets.forEach((offset, index) => {
    // -1 means an offset is duplicated and therefore cannot be inverted.
    sourceIndices.set(offset, sourceIndices.has(offset) ? -1 : index);
  });
  const domHash = hashAnchorText(domText);
  return (source: SourceAnchor) =>
    project(source, document, domText, sourceIndices, domHash);
}

/** Derived projections never replace the caller's original source selector. */
export function projectAnnotationAnchor(
  source: SourceAnchor,
  document: AnnotationDocument,
  domText: string,
): AnnotationProjection {
  return createAnnotationProjector(document, domText)(source);
}

function project(
  source: SourceAnchor,
  document: AnnotationDocument,
  domText: string,
  sourceIndices: Map<number, number>,
  domHash: string,
): AnnotationProjection {
  const unresolved = {
    canonicalAnchor: null,
    webAnchor: null,
    resolution: "unresolved" as const,
  };
  // Historical web exports may explicitly carry an unknown (empty) hash.
  // That sentinel never authenticates offsets and requires unique recovery.
  if (!sourceAnchorSchema.safeParse(source).success) return unresolved;
  let start: number, end: number;
  let web: WebAnchor | null = null;
  if (source.space === "web-dom-v1") {
    const found = uniqueWebRange(domText, source, domHash);
    if (!found) return unresolved;
    web = webAnchor(domText, found, domHash);
    const canonicalStart = sourceIndices.get(found.start);
    if (canonicalStart === undefined || canonicalStart < 0)
      return { ...unresolved, webAnchor: web };
    start = canonicalStart;
    end = start + found.end - found.start;
    const mapped = roundTrip(document, domText, start, end, sourceIndices);
    if (!mapped || mapped.start !== found.start || mapped.end !== found.end)
      return { ...unresolved, webAnchor: web };
  } else {
    if (
      source.contentHash !== document.contentHash ||
      !exactRange(
        document.text,
        source.startOffset,
        source.endOffset,
        source.text,
      )
    )
      return unresolved;
    start = source.startOffset;
    end = source.endOffset;
    const mapped = roundTrip(document, domText, start, end, sourceIndices);
    if (mapped) web = webAnchor(domText, mapped, domHash);
  }
  return {
    canonicalAnchor: {
      text: document.text.slice(start, end),
      startOffset: start,
      endOffset: end,
      contentHash: document.contentHash,
    },
    webAnchor: web,
    resolution: "anchored",
  };
}
