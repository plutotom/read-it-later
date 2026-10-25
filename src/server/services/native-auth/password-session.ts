/** Password enrollment requires a sign-in within the last ten minutes. */
export function isPasswordSetupSessionFresh(
  createdAt: Date,
  now = Date.now(),
): boolean {
  const age = now - createdAt.getTime();
  return Number.isFinite(age) && age >= 0 && age <= 10 * 60_000;
}
