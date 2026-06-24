"use client";

import { useSearchParams } from "next/navigation";
import { ArticleReader } from "~/app/_components/article-reader";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { sanitizeReturnTo } from "~/lib/article-navigation";
import { api } from "~/trpc/react";
import type { NotePosition } from "~/types/annotation";

interface ArticleDetailViewProps {
  id: string;
}

export function ArticleDetailView({ id }: ArticleDetailViewProps) {
  const searchParams = useSearchParams();
  const returnTo = sanitizeReturnTo(searchParams.get("from"));
  const { data: article, error } = api.article.get.useQuery({ id });
  const { data: notesRaw = [] } =
    api.annotation.getNotesByArticleId.useQuery({ articleId: id });

  const notes = notesRaw.map((n) => ({
    ...n,
    position: (n.position as NotePosition | null) ?? null,
  }));

  const utils = api.useUtils();

  const markAsRead = api.article.markAsRead.useMutation({
    onSuccess: () => {
      void utils.article.getAll.invalidate();
      void utils.article.get.invalidate({ id });
    },
  });

  const handleMarkAsRead = () => {
    if (article && !article.isRead) {
      markAsRead.mutate({ id: article.id });
    }
  };

  if (error) {
    return (
      <div className="bg-background flex min-h-screen flex-col">
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
        <main className="flex-1 p-4">
          <Alert>
            <AlertDescription>Article not found.</AlertDescription>
          </Alert>
        </main>
      </div>
    );
  }

  return (
    <ArticleReader
      article={article}
      onMarkAsRead={handleMarkAsRead}
      initialNotes={notes}
      returnTo={returnTo}
    />
  );
}
