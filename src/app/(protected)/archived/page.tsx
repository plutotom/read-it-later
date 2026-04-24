"use client";

import { api } from "~/trpc/react";
import { useRouter } from "next/navigation";
import { ArticleList } from "../../_components/article-list";
import { Layout } from "../../_components/layout";

export default function ArchivedPage() {
  const utils = api.useUtils();
  const {
    data: articles,
    isLoading,
    error,
  } = api.article.getArchived.useQuery();
  const router = useRouter();

  const unarchiveArticle = api.article.unarchive.useMutation({
    onSuccess: () => {
      void utils.article.getArchived.invalidate();
      void utils.article.getAll.invalidate();
    },
  });

  const deleteArticle = api.article.delete.useMutation({
    onSuccess: () => {
      void utils.article.getArchived.invalidate();
    },
  });

  const handleUnarchive = (articleId: string) => {
    unarchiveArticle.mutate({ id: articleId });
  };

  const handleDelete = (articleId: string) => {
    deleteArticle.mutate({ id: articleId });
  };

  if (isLoading)
    return (
      <div className="p-4 text-center text-gray-500">
        Loading archived articles...
      </div>
    );
  if (error)
    return (
      <div className="p-4 text-center text-red-500">Error: {error.message}</div>
    );

  return (
    <Layout pageTitle="Archived Articles">
      <div className="bg-background flex min-h-screen flex-col">
        <main className="mx-auto flex-1 w-full max-w-5xl p-4 sm:p-6">
          <ArticleList
            articles={articles ?? []}
            isLoading={isLoading}
            onArticleClick={(article) => router.push(`/article/${article.id}`)}
            onUnarchive={handleUnarchive}
            onDelete={handleDelete}
            showSearch
            showFilters={false}
          />
        </main>
      </div>
    </Layout>
  );
}
