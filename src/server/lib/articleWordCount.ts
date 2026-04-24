/** Used consistently for stored `readingTime` (minutes). */
export const ARTICLE_READING_WORDS_PER_MINUTE = 200;

/**
 * Strip URLs, emails, and symbol-only noise so counts align better with reading.
 */
function normalizePlainTextForWordCount(text: string): string {
  let t = text.normalize("NFKC");
  t = t.replace(/(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi, " ");
  t = t.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, " ");
  t = t.replace(/[^\p{L}\p{N}\s'-]/gu, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

/**
 * Count words in plain text for reading-time estimates.
 * Does not treat character length as words (Readability's `length` is characters).
 */
export function countArticleWords(plainText: string): number {
  const normalized = normalizePlainTextForWordCount(plainText);
  if (!normalized) return 0;
  return normalized
    .split(/\s+/)
    .filter((tok) => tok.length > 0 && /[\p{L}\p{N}]/u.test(tok)).length;
}

export function readingTimeFromWordCount(
  wordCount: number,
  options?: { minMinutes?: number; wordsPerMinute?: number },
): number {
  const wpm = options?.wordsPerMinute ?? ARTICLE_READING_WORDS_PER_MINUTE;
  const raw = Math.ceil(wordCount / wpm);
  const min = options?.minMinutes;
  if (min === undefined) return raw;
  return Math.max(min, raw);
}
