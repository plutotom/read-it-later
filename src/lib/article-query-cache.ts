import type { RouterOutputs } from "~/trpc/react";

export type ArticleListItem = RouterOutputs["article"]["getAll"][number];

type ArticleListCacheUtils = {
  article: {
    getAll: {
      cancel: (input?: undefined) => Promise<void>;
      setData: (
        input: undefined,
        updater: (
          data: ArticleListItem[] | undefined,
        ) => ArticleListItem[] | undefined,
      ) => void;
      refetch: (input?: undefined) => Promise<unknown>;
    };
  };
};

/** Put a newly created article at the top of the inbox list and sync with the server. */
export async function prependArticleToListCache(
  utils: ArticleListCacheUtils,
  article: ArticleListItem,
) {
  await utils.article.getAll.cancel();
  utils.article.getAll.setData(undefined, (current) => {
    if (!current) return [article];
    const rest = current.filter((a) => a.id !== article.id);
    return [article, ...rest];
  });
  await utils.article.getAll.refetch();
}

/** Update an existing article in the inbox list and sync with the server. */
export async function patchArticleInListCache(
  utils: ArticleListCacheUtils,
  article: ArticleListItem,
) {
  await utils.article.getAll.cancel();
  utils.article.getAll.setData(undefined, (current) => {
    if (!current) return [article];
    const index = current.findIndex((a) => a.id === article.id);
    if (index === -1) return [article, ...current];
    const next = [...current];
    next[index] = article;
    return next;
  });
  await utils.article.getAll.refetch();
}
