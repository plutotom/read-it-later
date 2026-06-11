import "server-only";

import { cache } from "react";

import { api } from "~/trpc/server";

export const getSharedArticleByToken = cache(async (token: string) => {
  return api.article.getByShareToken({ token });
});
