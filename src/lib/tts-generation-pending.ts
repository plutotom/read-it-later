/** Session flag while a getAudio/regenerate request may still be running server-side. */

const KEY_PREFIX = "tts-pending-";
const MAX_PENDING_MS = 15 * 60 * 1000;

function storageKey(articleId: string): string {
  return `${KEY_PREFIX}${articleId}`;
}

export function markTtsGenerationPending(articleId: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(storageKey(articleId), String(Date.now()));
}

export function clearTtsGenerationPending(articleId: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(storageKey(articleId));
}

/** True if user started generation recently and has not finished or timed out. */
export function isTtsGenerationPending(articleId: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  const raw = sessionStorage.getItem(storageKey(articleId));
  if (!raw) return false;
  const started = Number.parseInt(raw, 10);
  if (!Number.isFinite(started) || Date.now() - started > MAX_PENDING_MS) {
    sessionStorage.removeItem(storageKey(articleId));
    return false;
  }
  return true;
}
