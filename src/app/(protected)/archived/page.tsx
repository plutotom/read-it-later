"use client";

import { api } from "~/trpc/react";
import { useRouter } from "next/navigation";
import { buildArticlePath } from "~/lib/article-navigation";
import { withViewTransition } from "~/lib/with-view-transition";
import { ArticleList } from "../../_components/article-list";
import { Layout } from "../../_components/layout";
import { useDeleteArticle } from "../../_hooks/use-delete-article";

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

  const deleteArticle = useDeleteArticle();

  const handleUnarchive = (articleId: string) => {
    unarchiveArticle.mutate({ id: articleId });
  };

  const handleDelete = (articleId: string) => {
    deleteArticle.mutate({ id: articleId });
  };

  if (isLoading)
    return (
      <Layout pageTitle="Archived Articles">
        <div className="text-muted-foreground p-4 text-center">
          Loading archived articles...
        </div>
      </Layout>
    );
  if (error)
    return (
      <Layout pageTitle="Archived Articles">
        <div className="p-4 text-center text-red-400">
          Error: {error.message}
        </div>
      </Layout>
    );

  return (
    <Layout pageTitle="Archived Articles">
      <div className="bg-background flex min-h-screen flex-col">
        <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-6">
          <ArticleList
            articles={articles ?? []}
            isLoading={isLoading}
            onArticleClick={(article) =>
              withViewTransition(() =>
                router.push(buildArticlePath(article.id, "/archived")),
              )
            }
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
