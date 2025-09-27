"use client";

import React, { use } from "react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";

interface ArticleDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function ArticleDetailPage({ params }: ArticleDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();

  const { data: article, isLoading, error } = api.article.get.useQuery({ id });

  const deleteArticle = api.article.delete.useMutation({
    onSuccess: () => {
      router.push("/");
    },
    onError: (error) => {
      console.error("Failed to delete article:", error);
    },
  });

  const handleDelete = () => {
    if (
      confirm(
        "Are you sure you want to delete this article? This action cannot be undone.",
      )
    ) {
      deleteArticle.mutate({ id });
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-500">Loading article...</div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-500">
        Error loading article: {error.message}
      </div>
    );
  }

  if (!article) {
    return (
      <div className="p-4 text-center text-gray-500">Article not found.</div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="bg-blue-600 p-4 text-white shadow-md">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => router.back()}
            className="flex-shrink-0 text-white"
          >
            &larr; Back
          </button>
          <h1 className="min-w-0 flex-1 truncate text-xl font-bold">
            {article.title}
          </h1>
          <button
            onClick={handleDelete}
            disabled={deleteArticle.isPending}
            className="flex-shrink-0 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleteArticle.isPending ? "Deleting..." : "Delete"}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-4xl rounded-lg bg-white p-6 shadow-sm">
          <h1 className="mb-4 text-3xl font-bold text-gray-900">
            {article.title}
          </h1>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-6 block text-sm text-blue-600 hover:underline"
          >
            Original Source
          </a>
          <div className="prose prose-blue max-w-none">
            <div dangerouslySetInnerHTML={{ __html: article.content }} />
          </div>
        </div>
      </main>
    </div>
  );
}
