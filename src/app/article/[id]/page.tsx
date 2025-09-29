"use client";

import React, { use } from "react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import { Alert, AlertDescription } from "~/components/ui/alert";
import {
  ArrowLeft,
  ExternalLink,
  Trash2,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";

interface ArticleDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function ArticleDetailPage({ params }: ArticleDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);

  const { data: article, isLoading, error } = api.article.get.useQuery({ id });

  const utils = api.useUtils();

  const deleteArticle = api.article.delete.useMutation({
    onSuccess: () => {
      // Invalidate and refetch the articles list
      void utils.article.getAll.invalidate();
      router.push("/");
    },
    onError: (error) => {
      console.error("Failed to delete article:", error);
    },
  });

  const archiveArticle = api.article.archive.useMutation({
    onSuccess: () => {
      void utils.article.getAll.invalidate();
      void utils.article.getArchived.invalidate();
      router.push("/");
    },
    onError: (error) => {
      console.error("Failed to archive article:", error);
    },
  });

  const unarchiveArticle = api.article.unarchive.useMutation({
    onSuccess: () => {
      void utils.article.getAll.invalidate();
      void utils.article.getArchived.invalidate();
      router.push("/");
    },
    onError: (error) => {
      console.error("Failed to unarchive article:", error);
    },
  });

  const handleDelete = () => {
    deleteArticle.mutate({ id });
    setShowDeleteDialog(false);
  };

  const handleArchive = () => {
    if (article?.isArchived) {
      unarchiveArticle.mutate({ id });
    } else {
      archiveArticle.mutate({ id });
    }
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
          </div>
        </header>
        <main className="flex-1 p-4">
          <Card>
            <CardContent className="text-muted-foreground py-8 text-center">
              Loading article...
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
          </div>
        </header>
        <main className="flex-1 p-4">
          <Alert variant="destructive">
            <AlertDescription>
              Error loading article: {error.message}
            </AlertDescription>
          </Alert>
        </main>
      </div>
    );
  }

  if (!article) {
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
          </div>
        </header>
        <main className="flex-1 p-4">
          <Card>
            <CardContent className="text-muted-foreground py-8 text-center">
              Article not found.
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <header className="bg-card border-b p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-xl font-bold">
            {article.title}
          </h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleArchive}
              disabled={archiveArticle.isPending || unarchiveArticle.isPending}
              className="flex items-center gap-2"
            >
              {article.isArchived ? (
                <>
                  <ArchiveRestore className="h-4 w-4" />
                  Unarchive
                </>
              ) : (
                <>
                  <Archive className="h-4 w-4" />
                  Archive
                </>
              )}
            </Button>
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <DialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Article</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete this article? This action
                    cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={deleteArticle.isPending}
                  >
                    {deleteArticle.isPending ? "Deleting..." : "Delete"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <Card className="mx-auto max-w-4xl">
          <CardHeader>
            <CardTitle className="text-3xl">{article.title}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">Article</Badge>
              {article.isArchived && (
                <Badge
                  variant="secondary"
                  className="bg-gray-100 text-gray-600"
                >
                  Archived
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                asChild
                className="flex items-center gap-2"
              >
                <a href={article.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Original Source
                </a>
              </Button>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-6">
            <div className="prose prose-blue max-w-none">
              <div dangerouslySetInnerHTML={{ __html: article.content }} />
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
