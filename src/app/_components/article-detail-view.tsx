"use client";

import { ArticleReader } from "~/app/_components/article-reader";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { api } from "~/trpc/react";
import type { HighlightColor, NotePosition } from "~/types/annotation";

interface ArticleDetailViewProps {
  id: string;
}

export function ArticleDetailView({ id }: ArticleDetailViewProps) {
  const { data: article, error } = api.article.get.useQuery({ id });
  const { data: highlightsRaw = [] } =
    api.annotation.getHighlightsByArticleId.useQuery({ articleId: id });
  const { data: notesRaw = [] } =
    api.annotation.getNotesByArticleId.useQuery({ articleId: id });

  const highlights = highlightsRaw.map((h) => ({
    ...h,
    tags: h.tags ?? undefined,
  }));

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
    onMutate: async ({ id: highlightId, note }) => {
      if (note === undefined) return;

      await utils.annotation.getHighlightsByArticleId.cancel({ articleId: id });

      const previousHighlights =
        utils.annotation.getHighlightsByArticleId.getData({
          articleId: id,
        });

      utils.annotation.getHighlightsByArticleId.setData(
        { articleId: id },
        (old) => {
          if (!old) return old;
          return old.map((h) =>
            h.id === highlightId ? { ...h, note: note ?? null } : h,
          );
        },
      );

      return { previousHighlights };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousHighlights) {
        utils.annotation.getHighlightsByArticleId.setData(
          { articleId: id },
          context.previousHighlights,
        );
      }
    },
    onSuccess: () => {
      void utils.annotation.getHighlightsByArticleId.invalidate({
        articleId: id,
      });
    },
  });

  const deleteHighlight = api.annotation.deleteHighlight.useMutation({
    onMutate: async ({ id: highlightId }) => {
      await utils.annotation.getHighlightsByArticleId.cancel({ articleId: id });

      const previousHighlights =
        utils.annotation.getHighlightsByArticleId.getData({
          articleId: id,
        });

      utils.annotation.getHighlightsByArticleId.setData(
        { articleId: id },
        (old) => {
          if (!old) return old;
          return old.filter((h) => h.id !== highlightId);
        },
      );

      return { previousHighlights };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousHighlights) {
        utils.annotation.getHighlightsByArticleId.setData(
          { articleId: id },
          context.previousHighlights,
        );
      }
    },
    onSuccess: () => {
      void utils.annotation.getHighlightsByArticleId.invalidate({
        articleId: id,
      });
    },
  });

  const updateNote = api.annotation.updateNote.useMutation({
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
      color: data.color as HighlightColor,
      note: data.note,
      tags: data.tags,
      contextPrefix: data.contextPrefix,
      contextSuffix: data.contextSuffix,
    });
  };

  const handleDeleteHighlight = (highlightId: string) => {
    deleteHighlight.mutate({ id: highlightId });
  };

  const handleHighlightNoteUpdate = (
    highlightId: string,
    note: string | null,
  ) => {
    updateHighlight.mutate({
      id: highlightId,
      note,
    });
  };

  const handleAttachNoteToHighlight = (noteId: string, highlightId: string) => {
    updateNote.mutate({
      id: noteId,
      highlightId,
    });
  };

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
      initialHighlights={highlights}
      initialNotes={notes}
      onHighlightCreate={handleHighlight}
      onHighlightDelete={handleDeleteHighlight}
      onHighlightNoteUpdate={handleHighlightNoteUpdate}
      onAttachNoteToHighlight={handleAttachNoteToHighlight}
    />
  );
}
