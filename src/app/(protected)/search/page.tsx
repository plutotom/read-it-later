"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { ArrowLeft, Search } from "lucide-react";
import { getTextPreview } from "~/lib/text-utils";

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

  if (isLoading) {
    return (
      <div className="bg-background flex min-h-screen flex-col">
        <header className="bg-card border-b p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <h1 className="text-xl font-bold">Search Results</h1>
          </div>
        </header>
        <main className="flex-1 p-4">
          <Card>
            <CardContent className="text-muted-foreground py-8 text-center">
              Searching...
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-background flex min-h-screen flex-col">
        <header className="bg-card border-b p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <h1 className="text-xl font-bold">Search Results</h1>
          </div>
        </header>
        <main className="flex-1 p-4">
          <Alert variant="destructive">
            <AlertDescription>Error: {error.message}</AlertDescription>
          </Alert>
        </main>
      </div>
    );
  }

  const filteredArticles =
    allArticles?.filter(
      (article) =>
        article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.url.toLowerCase().includes(searchQuery.toLowerCase()),
    ) ?? [];

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <header className="bg-card border-b p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <h1 className="text-xl font-bold">Search Results</h1>
        </div>
      </header>

      <main className="flex-1 p-4">
        <Card className="mb-6">
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="flex gap-2">
              <Input
                type="text"
                placeholder="Search articles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                Search
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {filteredArticles.length === 0 && searchQuery ? (
            <Card>
              <CardContent className="text-muted-foreground py-8 text-center">
                No articles found for &quot;{searchQuery}&quot;.
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
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground line-clamp-3 text-sm">
                    {getTextPreview(article.content, 150)}
                  </p>
                  <p className="text-muted-foreground mt-2 truncate text-xs">
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

export default function SearchResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-background flex min-h-screen flex-col">
          <header className="bg-card border-b p-4 shadow-sm">
            <h1 className="text-xl font-bold">Search Results</h1>
          </header>
          <main className="flex-1 p-4">
            <Card>
              <CardContent className="text-muted-foreground py-8 text-center">
                Loading search...
              </CardContent>
            </Card>
          </main>
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
