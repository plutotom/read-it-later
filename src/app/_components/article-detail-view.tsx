"use client";

import { useSearchParams } from "next/navigation";
import { ArticleReader } from "~/app/_components/article-reader";
import { AddArticleFormCard } from "~/app/_components/AddArticleFormCard";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { sanitizeReturnTo } from "~/lib/article-navigation";
import { useSetArticleRead } from "../_hooks/use-set-article-read";
import { api } from "~/trpc/react";
import type { NotePosition } from "~/types/annotation";
import { GeneralProvider } from "../(protected)/contexts/general-context";

interface ArticleDetailViewProps {
  id: string;
}

export function ArticleDetailView({ id }: ArticleDetailViewProps) {
  const searchParams = useSearchParams();
  const returnTo = sanitizeReturnTo(searchParams.get("from"));
  const { data: article, error } = api.article.get.useQuery({ id });
  const { data: notesRaw = [] } = api.annotation.getNotesByArticleId.useQuery({
    articleId: id,
  });

  const notes = notesRaw.map((n) => ({
    ...n,
    position: (n.position as NotePosition | null) ?? null,
  }));

  const { setRead } = useSetArticleRead();
  const handleMarkAsRead = () => setRead(id, true);

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
    <GeneralProvider>
      <ArticleReader
        key={article.id}
        article={article}
        onMarkAsRead={handleMarkAsRead}
        initialNotes={notes}
        returnTo={returnTo}
      />
      <AddArticleFormCard />
    </GeneralProvider>
  );
}
