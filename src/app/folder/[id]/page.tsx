"use client";

import React, { use } from "react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { ArrowLeft, Folder } from "lucide-react";

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
            <h1 className="text-xl font-bold">Loading folder...</h1>
          </div>
        </header>
        <main className="flex-1 p-4">
          <Card>
            <CardContent className="text-muted-foreground py-8 text-center">
              Loading folder...
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (folderError) {
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
            <h1 className="text-xl font-bold">Folder Error</h1>
          </div>
        </header>
        <main className="flex-1 p-4">
          <Alert variant="destructive">
            <AlertDescription>
              Error loading folder: {folderError.message}
            </AlertDescription>
          </Alert>
        </main>
      </div>
    );
  }

  if (!folder) {
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
            <h1 className="text-xl font-bold">Folder Not Found</h1>
          </div>
        </header>
        <main className="flex-1 p-4">
          <Card>
            <CardContent className="text-muted-foreground py-8 text-center">
              Folder not found.
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

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
          <div className="flex items-center gap-2">
            <Folder className="h-5 w-5" />
            <h1 className="truncate text-xl font-bold">{folder.name}</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4">
        <div className="space-y-4">
          {articles && articles.length === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground py-8 text-center">
                No articles in this folder yet.
              </CardContent>
            </Card>
          ) : (
            articles?.map((article) => (
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
                    {article.content.substring(0, 150)}...
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
