"use client";

import React, { use } from "react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { ArticleReader } from "~/app/_components/article-reader";
import type { NotePosition } from "~/types/annotation";

interface ArticleDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function ArticleDetailPage({ params }: ArticleDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();

  const { data: article, isLoading, error } = api.article.get.useQuery({ id });
  const { data: highlightsRaw = [] } =
    api.annotation.getHighlightsByArticleId.useQuery(
      { articleId: id },
      { enabled: !!id },
    );
  const { data: notesRaw = [] } = api.annotation.getNotesByArticleId.useQuery(
    { articleId: id },
    { enabled: !!id },
  );

  // Transform highlights to match the Highlight type (convert null tags to undefined)
  const highlights = highlightsRaw.map((h) => ({
    ...h,
    tags: h.tags ?? undefined,
  }));

  // Transform notes to match the Note type (cast position from unknown)
  const notes = notesRaw.map((n) => ({
    ...n,
    position: (n.position as NotePosition | null) ?? null,
  }));

  const utils = api.useUtils();

  const createHighlight = api.annotation.createHighlight.useMutation({
    onSuccess: () => {
      void utils.annotation.getHighlightsByArticleId.invalidate({
        articleId: id,
      });
    },
  });

  const updateHighlight = api.annotation.updateHighlight.useMutation({
    onSuccess: () => {
      void utils.annotation.getHighlightsByArticleId.invalidate({
        articleId: id,
      });
    },
  });

  const deleteHighlight = api.annotation.deleteHighlight.useMutation({
    onSuccess: () => {
      void utils.annotation.getHighlightsByArticleId.invalidate({
        articleId: id,
      });
    },
  });

  const createNote = api.annotation.createNote.useMutation({
    onSuccess: () => {
      void utils.annotation.getNotesByArticleId.invalidate({ articleId: id });
    },
  });

  const markAsRead = api.article.markAsRead.useMutation({
    onSuccess: () => {
      void utils.article.getAll.invalidate();
      void utils.article.get.invalidate({ id });
    },
  });

  const handleHighlight = async (data: {
    text: string;
    startOffset: number;
    endOffset: number;
    color: string;
    note?: string;
    tags?: string[];
    contextPrefix?: string;
    contextSuffix?: string;
  }) => {
    if (!article) return;

    createHighlight.mutate({
      articleId: article.id,
      text: data.text,
      startOffset: data.startOffset,
      endOffset: data.endOffset,
      color: data.color as any,
      note: data.note,
      tags: data.tags,
      contextPrefix: data.contextPrefix,
      contextSuffix: data.contextSuffix,
    });
  };

  const handleUpdateHighlight = (
    highlightId: string,
    updateData: {
      color?: string;
      note?: string | null;
      tags?: string[];
    },
  ) => {
    updateHighlight.mutate({
      id: highlightId,
      color: updateData.color as any,
      note: updateData.note,
      tags: updateData.tags,
    });
  };

  const handleDeleteHighlight = (highlightId: string) => {
    deleteHighlight.mutate({ id: highlightId });
  };

  const handleAddNote = (content: string, highlightId?: string) => {
    if (!article) return;

    createNote.mutate({
      articleId: article.id,
      content,
      highlightId,
    });
  };

  const handleMarkAsRead = () => {
    if (article && !article.isRead) {
      markAsRead.mutate({ id: article.id });
    }
  };

  if (isLoading) {
    return (
      <div className="bg-background flex min-h-screen flex-col">
        <main className="flex-1 p-4">
          <Alert>
            <AlertDescription>Loading article...</AlertDescription>
          </Alert>
        </main>
      </div>
    );
  }

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
      highlights={highlights}
      notes={notes}
      onHighlight={handleHighlight}
      onUpdateHighlight={handleUpdateHighlight}
      onDeleteHighlight={handleDeleteHighlight}
      onAddNote={handleAddNote}
      onBackClick={() => router.back()}
      onMarkAsRead={handleMarkAsRead}
    />
  );
}
