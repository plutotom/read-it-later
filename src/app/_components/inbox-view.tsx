"use client";

import { useRouter } from "next/navigation";

import { api } from "~/trpc/react";
import { withViewTransition } from "~/lib/with-view-transition";
import { ArticleList } from "./article-list";
import { Layout } from "./layout";

export function InboxView() {
  const utils = api.useUtils();
  const { data: articles, isLoading, error } = api.article.getAll.useQuery();

  const archiveArticle = api.article.archive.useMutation({
    onSuccess: () => {
      void utils.article.getAll.invalidate();
    },
  });

  const deleteArticle = api.article.delete.useMutation({
    onSuccess: () => {
      void utils.article.getAll.invalidate();
    },
  });

  const router = useRouter();

  if (error)
    return (
      <Layout pageTitle="Inbox">
        <div className="p-4 text-center text-red-400">
          Error: {error.message}
        </div>
      </Layout>
    );

  const handleArchive = (articleId: string) => {
    archiveArticle.mutate({ id: articleId });
  };

  const handleDelete = (articleId: string) => {
    deleteArticle.mutate({ id: articleId });
  };

  return (
    <Layout pageTitle="Inbox">
      <div className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-6">
        <ArticleList
          articles={articles ?? []}
          isLoading={isLoading}
          onArticleClick={(article) =>
            withViewTransition(() => router.push(`/article/${article.id}`))
          }
          onArchive={handleArchive}
          onDelete={handleDelete}
          showSearch
          showFilters={false}
        />
      </div>
    </Layout>
  );
}
