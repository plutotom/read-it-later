"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [url, setUrl] = useState("");
  const {
    data: articles,
    isLoading,
    error,
    refetch,
  } = api.article.getAll.useQuery();
  const createArticle = api.article.create.useMutation({
    onSuccess: () => {
      setUrl("");
      void refetch();
    },
  });
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url) {
      createArticle.mutate({ url });
    }
  };

  if (isLoading)
    return (
      <div className="p-4 text-center text-gray-500">Loading articles...</div>
    );
  if (error)
    return (
      <div className="p-4 text-center text-red-500">Error: {error.message}</div>
    );

  const filteredArticles =
    articles?.filter(
      (article) =>
        article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.content.toLowerCase().includes(searchQuery.toLowerCase()),
    ) || [];

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="bg-blue-600 p-4 text-white shadow-md">
        <h1 className="text-xl font-bold">Read It Later</h1>
      </header>

      <main className="flex-1 p-4">
        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search articles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-gray-300 p-2 outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Add Article Form */}
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-lg border bg-white p-4 shadow-sm"
        >
          <input
            type="url"
            placeholder="Paste article URL here..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="mb-2 w-full rounded-md border border-gray-300 p-2 outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500"
            disabled={createArticle.isPending}
          />
          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 p-2 text-white transition-colors duration-150 ease-in-out hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            disabled={createArticle.isPending || !url}
          >
            {createArticle.isPending ? "Saving..." : "Save Article"}
          </button>
        </form>

        {/* Articles List */}
        <div className="space-y-4">
          {filteredArticles.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              No articles saved yet. Add some links to get started!
            </div>
          ) : (
            filteredArticles.map((article) => (
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
