"use client";

import { api } from "~/trpc/react";
import type { Article } from "~/types/article";

type ArticleUtils = ReturnType<typeof api.useUtils>["article"];

function patchArticle(
  article: Article,
  isRead: boolean,
  readAt: Date | null,
): Article {
  return { ...article, isRead, readAt };
}

function applyOptimistic(utils: ArticleUtils, id: string, isRead: boolean) {
  const readAt = isRead ? new Date() : null;
  const patchList = (old: Article[] | undefined) =>
    old?.map((article) =>
      article.id === id ? patchArticle(article, isRead, readAt) : article,
    );

  utils.getAll.setData(undefined, patchList);
  utils.getArchived.setData(undefined, patchList);
  utils.get.setData({ id }, (old) =>
    old ? patchArticle(old, isRead, readAt) : old,
  );
}

function readMutationOptions(utils: ArticleUtils, isRead: boolean) {
  return {
    onMutate: async ({ id }: { id: string }) => {
      await Promise.all([
        utils.getAll.cancel(),
        utils.getArchived.cancel(),
        utils.get.cancel({ id }),
      ]);
      const previousAll = utils.getAll.getData();
      const previousArchived = utils.getArchived.getData();
      const previousArticle = utils.get.getData({ id });
      applyOptimistic(utils, id, isRead);
      return { previousAll, previousArchived, previousArticle, id };
    },
    onError: (
      _error: unknown,
      _variables: { id: string },
      context:
        | {
            previousAll?: Article[];
            previousArchived?: Article[];
            previousArticle?: Article;
            id: string;
          }
        | undefined,
    ) => {
      if (!context) return;
      if (context.previousAll) {
        utils.getAll.setData(undefined, context.previousAll);
      }
      if (context.previousArchived) {
        utils.getArchived.setData(undefined, context.previousArchived);
      }
      if (context.previousArticle) {
        utils.get.setData({ id: context.id }, context.previousArticle);
      }
    },
    onSettled: (_data: unknown, _error: unknown, variables: { id: string }) => {
      void utils.getAll.invalidate();
      void utils.getArchived.invalidate();
      void utils.get.invalidate({ id: variables.id });
    },
  };
}

/**
 * Optimistic read/unread toggle for article lists and the reader menu.
 */
export function useSetArticleRead() {
  const utils = api.useUtils();
  const articleUtils = utils.article;

  const markAsRead = api.article.markAsRead.useMutation(
    readMutationOptions(articleUtils, true),
  );
  const markAsUnread = api.article.markAsUnread.useMutation(
    readMutationOptions(articleUtils, false),
  );

  return {
    setRead: (id: string, isRead: boolean) => {
      if (isRead) {
        markAsRead.mutate({ id });
        return;
      }
      markAsUnread.mutate({ id });
    },
    isPending: markAsRead.isPending || markAsUnread.isPending,
  };
}
