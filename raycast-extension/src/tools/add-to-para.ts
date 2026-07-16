import { type Tool } from "@raycast/api";
import { addToPara, getArticle } from "../api";

type Input = {
  /**
   * The id of the article to add to Para. Get this from the search-articles tool.
   */
  articleId: string;
};

/**
 * Add an article to the Para e-reader sync list. The article is converted to
 * plain text and will appear on the user's device on the next sync.
 */
export default async function tool(input: Input) {
  const exportRow = await addToPara({ articleId: input.articleId });
  return {
    id: exportRow.id,
    articleId: exportRow.articleId,
    title: exportRow.title,
    filename: exportRow.filename,
    bytes: exportRow.bytes,
    isLarge: exportRow.isLarge,
  };
}

export const confirmation: Tool.Confirmation<Input> = async (input) => {
  const article = await getArticle(input.articleId);
  return {
    title: "Add to Para",
    message: `Add “${article.title || article.url}” to your Para sync list?`,
    info: [
      {
        name: "Device sync",
        value: "Appears on your e-reader after the next sync.",
      },
    ],
  };
};
