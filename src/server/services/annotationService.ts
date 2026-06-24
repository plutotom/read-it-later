/**
 * Annotation service — highlights and notes. Shared by the tRPC annotation
 * router and `/api/v1` highlight/note endpoints. Scoped to `userId`.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import type { db as Db } from "~/server/db";
import { highlights, notes } from "~/server/db/schema";

type Database = typeof Db;
type Highlight = typeof highlights.$inferSelect;
type Note = typeof notes.$inferSelect;

// Order here drives the swatch order in the highlight toolbar.
export const HIGHLIGHT_COLORS = [
  "green",
  "yellow",
  "purple",
  "blue",
  "pink",
  "orange",
  "red",
  "gray",
] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

// ---- Highlights ----------------------------------------------------------

export async function listHighlights(
  db: Database,
  userId: string,
  articleId: string,
): Promise<Highlight[]> {
  return db.query.highlights.findMany({
    where: and(
      eq(highlights.articleId, articleId),
      eq(highlights.userId, userId),
    ),
    orderBy: [asc(highlights.startOffset)],
  });
}

export type CreateHighlightInput = {
  articleId: string;
  text: string;
  startOffset: number;
  endOffset: number;
  color?: HighlightColor;
  // Context selectors — required for reliable re-anchoring.
  contextPrefix: string;
  contextSuffix: string;
  // Anchoring metadata. Defaults applied if the client omits them.
  version?: number;
  anchorContentHash?: string;
  tags?: string[];
};

export async function createHighlight(
  db: Database,
  userId: string,
  input: CreateHighlightInput,
): Promise<Highlight> {
  const [created] = await db
    .insert(highlights)
    .values({
      userId,
      articleId: input.articleId,
      text: input.text,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      color: input.color ?? "yellow",
      contextPrefix: input.contextPrefix,
      contextSuffix: input.contextSuffix,
      version: input.version ?? 1,
      anchorContentHash: input.anchorContentHash ?? null,
      tags: input.tags ?? [],
    })
    .returning();

  if (!created) throw new Error("Failed to create highlight");
  return created;
}

export type UpdateHighlightPatch = {
  color?: HighlightColor;
  tags?: string[];
  // Set by the re-anchoring routine when offsets are recomputed or a highlight
  // can no longer be located in the current content.
  startOffset?: number;
  endOffset?: number;
  anchorContentHash?: string;
  anchorStatus?: "anchored" | "lost";
};

export async function updateHighlight(
  db: Database,
  userId: string,
  id: string,
  patch: UpdateHighlightPatch,
): Promise<Highlight | undefined> {
  const updateData: Partial<typeof highlights.$inferInsert> = {};
  if (patch.color !== undefined) updateData.color = patch.color;
  if (patch.tags !== undefined) updateData.tags = patch.tags;
  if (patch.startOffset !== undefined)
    updateData.startOffset = patch.startOffset;
  if (patch.endOffset !== undefined) updateData.endOffset = patch.endOffset;
  if (patch.anchorContentHash !== undefined)
    updateData.anchorContentHash = patch.anchorContentHash;
  if (patch.anchorStatus !== undefined)
    updateData.anchorStatus = patch.anchorStatus;

  if (Object.keys(updateData).length === 0) {
    return db.query.highlights.findFirst({
      where: and(eq(highlights.id, id), eq(highlights.userId, userId)),
    });
  }

  const [updated] = await db
    .update(highlights)
    .set(updateData)
    .where(and(eq(highlights.id, id), eq(highlights.userId, userId)))
    .returning();

  return updated;
}

export async function deleteHighlight(
  db: Database,
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await db
    .delete(highlights)
    .where(and(eq(highlights.id, id), eq(highlights.userId, userId)))
    .returning({ id: highlights.id });
  return result.length > 0;
}

// ---- Notes ---------------------------------------------------------------

export async function listNotes(
  db: Database,
  userId: string,
  articleId: string,
): Promise<Note[]> {
  return db.query.notes.findMany({
    where: and(eq(notes.articleId, articleId), eq(notes.userId, userId)),
    orderBy: [desc(notes.createdAt)],
  });
}

export type CreateNoteInput = {
  articleId: string;
  content: string;
  highlightId?: string | null;
};

export async function createNote(
  db: Database,
  userId: string,
  input: CreateNoteInput,
): Promise<Note> {
  const [created] = await db
    .insert(notes)
    .values({
      userId,
      articleId: input.articleId,
      content: input.content,
      highlightId: input.highlightId ?? null,
    })
    .returning();

  if (!created) throw new Error("Failed to create note");
  return created;
}

export type UpdateNotePatch = {
  content?: string;
  highlightId?: string | null;
  position?: { x: number; y: number; page?: number };
};

export async function updateNote(
  db: Database,
  userId: string,
  id: string,
  patch: UpdateNotePatch,
): Promise<Note | undefined> {
  const updateData: Partial<typeof notes.$inferInsert> = {};
  if (patch.content !== undefined) updateData.content = patch.content;
  if (patch.highlightId !== undefined) updateData.highlightId = patch.highlightId;
  if (patch.position !== undefined) updateData.position = patch.position;

  if (Object.keys(updateData).length === 0) {
    return db.query.notes.findFirst({
      where: and(eq(notes.id, id), eq(notes.userId, userId)),
    });
  }

  const [updated] = await db
    .update(notes)
    .set(updateData)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .returning();

  return updated;
}

export async function deleteNote(
  db: Database,
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await db
    .delete(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .returning({ id: notes.id });
  return result.length > 0;
}
