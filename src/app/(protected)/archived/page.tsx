"use client";

import { api } from "~/trpc/react";
import { useRouter } from "next/navigation";
import { Button } from "~/components/ui/button";

import { ArrowLeft } from "lucide-react";
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
        {/* <header className="bg-card border-b p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <h1 className="text-xl font-bold">Archived Articles</h1>
            </div>
            <Button variant="outline" onClick={() => router.push("/")}>
              View All Articles
            </Button>
          </div>
        </header> */}

        <main className="flex-1 p-4">
          {/* Articles List */}
          <ArticleList
            articles={articles || []}
            isLoading={isLoading}
            onArticleClick={(article) => router.push(`/article/${article.id}`)}
            onUnarchive={handleUnarchive}
            onDelete={handleDelete}
            showSearch={true}
            showFilters={true}
          />
        </main>
      </div>
    </Layout>
  );
}
