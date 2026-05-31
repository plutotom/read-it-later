import path from "node:path";

const TXT_EXTENSION = ".txt";
const MAX_FIRMWARE_TMP_PATH_BYTES = 95;
const FIRMWARE_BOOKS_DIR = "/books/";
const TEMP_SUFFIX = ".tmp";

export const MAX_PARA_FILENAME_BYTES =
  MAX_FIRMWARE_TMP_PATH_BYTES - FIRMWARE_BOOKS_DIR.length - TEMP_SUFFIX.length;

function truncateAsciiCore(core: string, reservedSuffix = ""): string {
  const maxCoreLength =
    MAX_PARA_FILENAME_BYTES - TXT_EXTENSION.length - reservedSuffix.length;
  return core.slice(0, Math.max(1, maxCoreLength));
}

function buildTxtFilename(core: string, reservedSuffix = ""): string {
  return `${truncateAsciiCore(core, reservedSuffix)}${reservedSuffix}${TXT_EXTENSION}`;
}

export function sanitizeTxtFilename(inputName: string): string {
  const base = path.basename(inputName).trim();
  const withoutExt = base.replace(/\.[^/.]+$/, "");
  const lowered = withoutExt.toLowerCase();
  const slug = lowered
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  const safeCore = slug || "article";
  return buildTxtFilename(safeCore);
}

export function resolveUniqueFilename(
  baseFilename: string,
  takenFilenames: Set<string>,
): string {
  if (!takenFilenames.has(baseFilename)) {
    return baseFilename;
  }

  const core = baseFilename.slice(0, -TXT_EXTENSION.length);

  for (let index = 2; ; index++) {
    const suffix = `-${index}`;
    const candidate = buildTxtFilename(core, suffix);
    if (!takenFilenames.has(candidate)) {
      return candidate;
    }
  }
}
