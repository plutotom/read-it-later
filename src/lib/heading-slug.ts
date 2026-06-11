/**
 * Slugify heading text for anchor IDs.
 */
export function slugifyHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  return slug || "section";
}

/**
 * Assign a unique slug, incrementing when duplicates appear.
 */
export function uniqueHeadingId(
  text: string,
  slugCounts: Map<string, number>,
): string {
  const base = slugifyHeading(text);
  const count = slugCounts.get(base) ?? 0;
  slugCounts.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}
