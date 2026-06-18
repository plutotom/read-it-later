import { getTags } from "../api";

/**
 * Returns the tags already used in the library, with their article counts.
 * Call this before tagging articles so new tags match the user's existing
 * vocabulary instead of inventing near-duplicates.
 */
export default async function tool() {
  const tags = await getTags();
  return tags.map((tag) => ({
    name: tag.name ?? tag.tag ?? "",
    count: tag.count ?? 0,
  }));
}
