"use client";

import React, { use } from "react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";

interface FolderViewPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function FolderViewPage({ params }: FolderViewPageProps) {
  const { id: folderId } = use(params);
  const router = useRouter();

  const {
    data: folder,
    isLoading: isFolderLoading,
    error: folderError,
  } = api.folder.get.useQuery({ id: folderId });
  const { data: articles, isLoading: isArticlesLoading } =
    api.article.getAll.useQuery(undefined, {
      select: (data) => data.filter((article) => article.folderId === folderId),
    });

  if (isFolderLoading || isArticlesLoading) {
    return (
      <div className="p-4 text-center text-gray-500">Loading folder...</div>
    );
  }

  if (folderError) {
    return (
      <div className="p-4 text-center text-red-500">
        Error loading folder: {folderError.message}
      </div>
    );
  }

  if (!folder) {
    return (
      <div className="p-4 text-center text-gray-500">Folder not found.</div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="flex items-center bg-blue-600 p-4 text-white shadow-md">
        <button onClick={() => router.back()} className="mr-4 text-white">
          &larr; Back
        </button>
        <h1 className="truncate text-xl font-bold">{folder.name}</h1>
      </header>

      <main className="flex-1 p-4">
        <div className="space-y-4">
          {articles && articles.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              No articles in this folder yet.
            </div>
          ) : (
            articles?.map((article) => (
              <div
                key={article.id}
                className="cursor-pointer rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-colors duration-150 hover:bg-gray-50"
                onClick={() => router.push(`/article/${article.id}`)}
              >
                <h3 className="mb-1 line-clamp-2 text-lg font-semibold text-gray-900">
                  {article.title}
                </h3>
                <p className="mb-2 line-clamp-3 text-sm text-gray-600">
                  {article.content.substring(0, 150)}...
                </p>
                <p className="truncate text-xs text-gray-500">{article.url}</p>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
