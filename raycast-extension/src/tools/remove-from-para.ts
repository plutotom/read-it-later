import { type Tool } from "@raycast/api";
import {
  getArticle,
  listParaExports,
  removeFromParaByArticleId,
  removeFromParaByExportId,
} from "../api";

type Input = {
  /**
   * The Para export id. Get this from the list-para-exports tool.
   */
  exportId?: string;
  /**
   * The article id. Get this from the search-articles tool.
   */
  articleId?: string;
};

/**
 * Remove an article from the Para e-reader sync list. Provide either exportId
 * or articleId. The device will delete the file on the next sync.
 */
export default async function tool(input: Input) {
  if (!input.exportId && !input.articleId) {
    throw new Error("Provide exportId or articleId.");
  }

  if (input.exportId) {
    await removeFromParaByExportId(input.exportId);
    return { success: true, exportId: input.exportId };
  }

  await removeFromParaByArticleId(input.articleId!);
  return { success: true, articleId: input.articleId };
}

export const confirmation: Tool.Confirmation<Input> = async (input) => {
  if (!input.exportId && !input.articleId) {
    throw new Error("Provide exportId or articleId.");
  }

  let title = "Para export";
  if (input.articleId) {
    const article = await getArticle(input.articleId);
    title = article.title || article.url;
  } else if (input.exportId) {
    const exports = await listParaExports();
    const match = exports.find((row) => row.id === input.exportId);
    if (match) title = match.title;
  }

  return {
    title: "Remove from Para",
    message: `Remove “${title}” from your Para sync list?`,
    info: [
      {
        name: "Device sync",
        value: "Deleted from your e-reader on the next sync.",
      },
    ],
  };
};
