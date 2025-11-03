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

  const createArticleFromText = api.article.createFromText.useMutation({
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
    url?: string;
    content?: string;
    title?: string;
    author?: string;
    publishedAt?: Date;
    folderId?: string;
    tags?: string[];
  }) => {
    if (data.url) {
      // URL mode
      await createArticle.mutateAsync({
        url: data.url,
        folderId: data.folderId,
        tags: data.tags,
      });
    } else if (data.content && data.title) {
      // Text mode
      await createArticleFromText.mutateAsync({
        content: data.content,
        title: data.title,
        author: data.author,
        publishedAt: data.publishedAt,
        folderId: data.folderId,
        tags: data.tags,
      });
    }
  };

  if (isLoading)
    return (
      <div className="flex min-h-screen flex-col bg-gray-900">
        <div className="p-4 text-center text-gray-400">Loading articles...</div>
      </div>
    );
  if (error)
    return (
      <div className="flex min-h-screen flex-col bg-gray-900">
        <div className="p-4 text-center text-red-400">Error: {error.message}</div>
      </div>
    );

  const handleArchive = (articleId: string) => {
    archiveArticle.mutate({ id: articleId });
  };

  const handleDelete = (articleId: string) => {
    deleteArticle.mutate({ id: articleId });
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-900">
      <header className="border-b border-gray-700 bg-gray-800 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Read It Later</h1>
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
              isLoading={
                createArticle.isPending || createArticleFromText.isPending
              }
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
