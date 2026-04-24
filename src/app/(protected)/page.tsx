"use client";

import { api } from "~/trpc/react";
import { useRouter } from "next/navigation";
import { ArticleList } from "../_components/article-list";
import { Layout } from "../_components/layout";
import { withViewTransition } from "~/lib/with-view-transition";

export default function HomePage() {
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

  if (isLoading)
    return (
      <Layout pageTitle="Inbox">
        <div className="p-4 text-center text-gray-400">Loading articles...</div>
      </Layout>
    );
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
      <div className="mx-auto flex-1 w-full max-w-5xl p-4 sm:p-6">
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
