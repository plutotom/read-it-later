"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [searchQuery, setSearchQuery] = useState(initialQuery);

  const { data: allArticles, isLoading, error } = api.article.getAll.useQuery();

  useEffect(() => {
    setSearchQuery(initialQuery);
  }, [initialQuery]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/search?q=${searchQuery}`);
  };

  if (isLoading)
    return <div className="p-4 text-center text-gray-500">Searching...</div>;
  if (error)
    return (
      <div className="p-4 text-center text-red-500">Error: {error.message}</div>
    );

  const filteredArticles =
    allArticles?.filter(
      (article) =>
        article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.url.toLowerCase().includes(searchQuery.toLowerCase()),
    ) ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="flex items-center bg-blue-600 p-4 text-white shadow-md">
        <button onClick={() => router.back()} className="mr-4 text-white">
          &larr; Back
        </button>
        <h1 className="text-xl font-bold">Search Results</h1>
      </header>

      <main className="flex-1 p-4">
        <form onSubmit={handleSearch} className="mb-6">
          <input
            type="text"
            placeholder="Search articles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-gray-300 p-2 outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500"
          />
        </form>

        <div className="space-y-4">
          {filteredArticles.length === 0 && searchQuery ? (
            <div className="py-8 text-center text-gray-500">
              No articles found for &quot;{searchQuery}&quot;.
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

export default function SearchResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4 text-center text-gray-500">Loading search...</div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
