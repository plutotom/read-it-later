import { listParaExports } from "../api";

/**
 * List every article on the user's Para e-reader sync list. Returns export
 * metadata (id, articleId, title, filename, bytes, isLarge).
 */
export default async function tool() {
  return listParaExports();
}
