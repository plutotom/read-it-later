"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { useRouter } from "next/navigation";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { getTextPreview } from "~/lib/text-utils";
import { Bookmark } from "lucide-react";
import { AddArticleForm } from "./_components/add-article-form";
import { ArticleList } from "./_components/article-list";

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const utils = api.useUtils();
  const { data: articles, isLoading, error } = api.article.getAll.useQuery();
  const { data: folders } = api.folder.getAll.useQuery();
  const createArticle = api.article.create.useMutation({
    onSuccess: () => {
      // Invalidate and refetch the articles list
      void utils.article.getAll.invalidate();
    },
  });

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

  const handleArticleSubmit = async (data: {
    url: string;
    folderId?: string;
    tags?: string[];
  }) => {
    await createArticle.mutateAsync({
      url: data.url,
      folderId: data.folderId,
      tags: data.tags,
    });
  };

  if (isLoading)
    return (
      <div className="p-4 text-center text-gray-500">Loading articles...</div>
    );
  if (error)
    return (
      <div className="p-4 text-center text-red-500">Error: {error.message}</div>
    );

  const handleArchive = (articleId: string) => {
    archiveArticle.mutate({ id: articleId });
  };

  const handleDelete = (articleId: string) => {
    deleteArticle.mutate({ id: articleId });
  };

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <header className="bg-card border-b p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Read It Later</h1>
          <Button variant="outline" onClick={() => router.push("/archived")}>
            View Archived
          </Button>
        </div>
      </header>

      <main className="flex-1 p-4">
        {/* Add Article Form */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Add New Article</CardTitle>
            <CardDescription>
              Paste a URL to save an article for later reading
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AddArticleForm
              onSubmit={handleArticleSubmit}
              folders={folders}
              isLoading={createArticle.isPending}
            />
          </CardContent>
        </Card>

        {/* Articles List */}
        <ArticleList
          articles={articles || []}
          isLoading={isLoading}
          onArticleClick={(article) => router.push(`/article/${article.id}`)}
          onArchive={handleArchive}
          onDelete={handleDelete}
          showSearch={true}
          showFilters={true}
        />
      </main>
    </div>
  );
}
