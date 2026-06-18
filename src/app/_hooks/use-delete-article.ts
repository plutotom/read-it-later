"use client";

import { api } from "~/trpc/react";

/**
 * Optimistic article deletion shared across the inbox list and the reader.
 *
 * The article is removed from the `getAll`/`getArchived` caches immediately
 * (so the UI updates and any navigation lands on an already-updated list),
 * the network request runs in the background, and the caches roll back if the
 * delete fails. This avoids waiting for the server round-trip before the UI
 * responds.
 */
export function useDeleteArticle(options?: {
  /** Fired after the optimistic cache update — e.g. to navigate away. */
  onOptimisticDelete?: () => void;
}) {
  const utils = api.useUtils();

  return api.article.delete.useMutation({
    onMutate: async ({ id }) => {
      // Stop in-flight fetches from clobbering our optimistic update.
      await Promise.all([
        utils.article.getAll.cancel(),
        utils.article.getArchived.cancel(),
      ]);

      const previousAll = utils.article.getAll.getData();
      const previousArchived = utils.article.getArchived.getData();

      utils.article.getAll.setData(undefined, (old) =>
        old?.filter((article) => article.id !== id),
      );
      utils.article.getArchived.setData(undefined, (old) =>
        old?.filter((article) => article.id !== id),
      );

      // Run side effects (navigation) only after the caches are updated.
      options?.onOptimisticDelete?.();

      return { previousAll, previousArchived };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousAll) {
        utils.article.getAll.setData(undefined, context.previousAll);
      }
      if (context?.previousArchived) {
        utils.article.getArchived.setData(undefined, context.previousArchived);
      }
    },
    onSettled: () => {
      void utils.article.getAll.invalidate();
      void utils.article.getArchived.invalidate();
    },
  });
}
