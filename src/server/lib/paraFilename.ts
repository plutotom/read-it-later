import path from "node:path";

export function sanitizeTxtFilename(inputName: string): string {
  const base = path.basename(inputName).trim();
  const withoutExt = base.replace(/\.[^/.]+$/, "");
  const lowered = withoutExt.toLowerCase();
  const slug = lowered
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  const safeCore = slug || "article";
  return `${safeCore}.txt`;
}

export function resolveUniqueFilename(
  baseFilename: string,
  takenFilenames: Set<string>,
): string {
  if (!takenFilenames.has(baseFilename)) {
    return baseFilename;
  }

  const ext = ".txt";
  const core = baseFilename.slice(0, -ext.length);

  for (let index = 2; ; index++) {
    const candidate = `${core}-${index}${ext}`;
    if (!takenFilenames.has(candidate)) {
      return candidate;
    }
  }
}
