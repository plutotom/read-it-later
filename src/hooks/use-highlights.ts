"use client";

/**
 * Data hook for an article's highlights. Wraps the tRPC `annotation` router with
 * optimistic create/update/delete so a new highlight paints immediately instead
 * of waiting for a refetch (which is what caused the old flash/jank).
 */
import { useMemo } from "react";
import { api } from "~/trpc/react";
import type { RouterInputs, RouterOutputs } from "~/trpc/react";

export type HighlightRow = RouterOutputs["annotation"]["getHighlightsByArticleId"][number];
type CreateInput = RouterInputs["annotation"]["createHighlight"];
type UpdateInput = RouterInputs["annotation"]["updateHighlight"];

export function useHighlights(articleId: string) {
  const utils = api.useUtils();
  const key = { articleId };

  const query = api.annotation.getHighlightsByArticleId.useQuery(key, {
    staleTime: 30_000,
  });

  const createMutation = api.annotation.createHighlight.useMutation({
    onMutate: async (input: CreateInput) => {
      await utils.annotation.getHighlightsByArticleId.cancel(key);
      const previous = utils.annotation.getHighlightsByArticleId.getData(key);
      const now = new Date();
      const optimistic: HighlightRow = {
        id: `temp-${crypto.randomUUID()}`,
        userId: "",
        articleId: input.articleId,
        text: input.text,
        startOffset: input.startOffset,
        endOffset: input.endOffset,
        color: input.color ?? "yellow",
        contextPrefix: input.contextPrefix,
        contextSuffix: input.contextSuffix,
        version: input.version ?? 1,
        anchorContentHash: input.anchorContentHash ?? null,
        anchorStatus: "anchored",
        tags: input.tags ?? [],
        createdAt: now,
        updatedAt: now,
      };
      utils.annotation.getHighlightsByArticleId.setData(key, (old) => [
        ...(old ?? []),
        optimistic,
      ]);
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) {
        utils.annotation.getHighlightsByArticleId.setData(key, ctx.previous);
      }
    },
    onSettled: () => {
      void utils.annotation.getHighlightsByArticleId.invalidate(key);
    },
  });

  const updateMutation = api.annotation.updateHighlight.useMutation({
    onMutate: async (input: UpdateInput) => {
      await utils.annotation.getHighlightsByArticleId.cancel(key);
      const previous = utils.annotation.getHighlightsByArticleId.getData(key);
      utils.annotation.getHighlightsByArticleId.setData(key, (old) =>
        (old ?? []).map((h) =>
          h.id === input.id ? { ...h, ...stripUndefined(input) } : h,
        ),
      );
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) {
        utils.annotation.getHighlightsByArticleId.setData(key, ctx.previous);
      }
    },
    onSettled: () => {
      void utils.annotation.getHighlightsByArticleId.invalidate(key);
    },
  });

  const deleteMutation = api.annotation.deleteHighlight.useMutation({
    onMutate: async (input: { id: string }) => {
      await utils.annotation.getHighlightsByArticleId.cancel(key);
      const previous = utils.annotation.getHighlightsByArticleId.getData(key);
      utils.annotation.getHighlightsByArticleId.setData(key, (old) =>
        (old ?? []).filter((h) => h.id !== input.id),
      );
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) {
        utils.annotation.getHighlightsByArticleId.setData(key, ctx.previous);
      }
    },
    onSettled: () => {
      void utils.annotation.getHighlightsByArticleId.invalidate(key);
    },
  });

  const highlights = useMemo(() => query.data ?? [], [query.data]);

  return {
    highlights,
    isLoading: query.isLoading,
    createHighlight: createMutation.mutate,
    updateHighlight: updateMutation.mutate,
    deleteHighlight: deleteMutation.mutate,
  };
}

/** Drop keys whose value is `undefined` so they don't overwrite existing fields. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k as keyof T] = v as T[keyof T];
  }
  return out;
}
