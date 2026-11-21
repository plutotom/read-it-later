"use client";

import { api } from "~/trpc/react";

/** Refresh read state in both library places and the reader after a write. */
export function useSetArticleRead() {
  const { article } = api.useUtils();
  const refresh = async (_data: unknown, { id }: { id: string }) => {
    await Promise.all([
      article.getAll.invalidate(),
      article.getArchived.invalidate(),
      article.get.invalidate({ id }),
    ]);
  };

  const markAsRead = api.article.markAsRead.useMutation({ onSuccess: refresh });
  const markAsUnread = api.article.markAsUnread.useMutation({
    onSuccess: refresh,
  });

  return {
    setRead: (id: string, isRead: boolean) => {
      (isRead ? markAsRead : markAsUnread).mutate({ id });
    },
    isPending: markAsRead.isPending || markAsUnread.isPending,
  };
}
