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
    <div className="bg-background flex min-h-screen flex-col">
      <header className="bg-card border-b p-4 shadow-sm">
        <h1 className="text-xl font-bold">Read It Later</h1>
      </header>

      <main className="flex-1 p-4">
        {/* Search */}
        <div className="mb-4">
          <Input
            type="text"
            placeholder="Search articles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Add Article Form */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Add New Article</CardTitle>
            <CardDescription>
              Paste a URL to save an article for later reading
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="url"
                placeholder="Paste article URL here..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={createArticle.isPending}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={createArticle.isPending || !url}
              >
                {createArticle.isPending ? "Saving..." : "Save Article"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Articles List */}
        <div className="space-y-4">
          {filteredArticles.length === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground py-8 text-center">
                No articles saved yet. Add some links to get started!
              </CardContent>
            </Card>
          ) : (
            filteredArticles.map((article) => (
              <Card
                key={article.id}
                className="hover:bg-accent cursor-pointer transition-colors"
                onClick={() => router.push(`/article/${article.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="line-clamp-2">
                      {article.title}
                    </CardTitle>
                    <Badge variant="outline">Article</Badge>
                  </div>
                  <CardDescription className="line-clamp-3">
                    {getTextPreview(article.content, 150)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground truncate text-xs">
                    {article.url}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
