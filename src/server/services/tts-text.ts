const MAX_SENTENCE_CHARS = 500;
const SENTENCE_TERMINALS = new Set([".", "!", "?", "…"]);

/**
 * Guarantee no single sentence exceeds the engine's per-sentence limit.
 * Sentences are bounded by terminal punctuation and pause markup tokens; any
 * longer run is split at word boundaries by inserting periods. This is a safety
 * net for content (long unpunctuated paragraphs, headings) that would otherwise
 * make Google TTS reject the request.
 */
export function enforceMaxSentenceLength(
  text: string,
  maxChars: number = MAX_SENTENCE_CHARS,
): string {
  // Protect multi-word pause tokens from space tokenization. They also act as
  // natural sentence boundaries, so reset the running length when we hit one.
  const LONG = "PL";
  const SHORT = "PS";
  const protectedText = text
    .replace(/\[pause long\]/gi, LONG)
    .replace(/\[pause\]/gi, SHORT);

  const tokens = protectedText.split(/\s+/);
  const out: string[] = [];
  let runLength = 0;

  for (const token of tokens) {
    if (!token) continue;

    if (token === LONG || token === SHORT) {
      out.push(token);
      runLength = 0;
      continue;
    }

    const spacer = runLength > 0 ? 1 : 0;
    if (runLength > 0 && runLength + spacer + token.length > maxChars) {
      const prev = out[out.length - 1];
      if (prev && prev !== LONG && prev !== SHORT) {
        const lastChar = prev[prev.length - 1]!;
        if (!SENTENCE_TERMINALS.has(lastChar)) {
          out[out.length - 1] = prev + ".";
        }
      }
      runLength = 0;
    }

    out.push(token);
    runLength += (runLength > 0 ? 1 : 0) + token.length;

    const lastChar = token[token.length - 1]!;
    if (SENTENCE_TERMINALS.has(lastChar)) {
      runLength = 0;
    }
  }

  return out
    .join(" ")
    .replaceAll(LONG, "[pause long]")
    .replaceAll(SHORT, "[pause]");
}
