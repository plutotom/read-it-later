/** Amazon page where users approve personal document senders. */
export const AMAZON_APPROVED_SENDERS_URL =
  "https://www.amazon.com/hz/mycd/digital-console/contentlist/approvelist";

export const AMAZON_MANAGE_CONTENT_URL =
  "https://www.amazon.com/hz/mycd/digital-console/alldevices/landing";

/** Max attachment size for Kindle email delivery (~50 MB, stay under). */
export const KINDLE_MAX_ATTACHMENT_BYTES = 45 * 1024 * 1024;

export function isValidKindleEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(trimmed)) return false;
  return trimmed.includes("kindle");
}

export function buildSenderLocalPart(senderToken: string): string {
  return `kindle_delivery_${senderToken}`;
}

export function buildSenderEmail(senderToken: string, domain: string): string {
  return `${buildSenderLocalPart(senderToken)}@${domain}`;
}
