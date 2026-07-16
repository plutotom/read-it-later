/**
 * Folder service — shared by the tRPC folder router and `/api/v1/folders`.
 * All queries are scoped to `userId`.
 */
import { and, asc, eq } from "drizzle-orm";
import type { db as Db } from "~/server/db";
import { folders } from "~/server/db/schema";

type Database = typeof Db;
type Folder = typeof folders.$inferSelect;

export async function listFolders(
  db: Database,
  userId: string,
): Promise<Folder[]> {
  return db.query.folders.findMany({
    where: eq(folders.userId, userId),
    orderBy: [asc(folders.name)],
  });
}

export async function getFolder(
  db: Database,
  userId: string,
  id: string,
): Promise<Folder | undefined> {
  return db.query.folders.findFirst({
    where: and(eq(folders.id, id), eq(folders.userId, userId)),
  });
}

export type CreateFolderInput = {
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  parentId?: string | null;
};

export async function createFolder(
  db: Database,
  userId: string,
  input: CreateFolderInput,
): Promise<Folder> {
  const [created] = await db
    .insert(folders)
    .values({
      userId,
      name: input.name,
      description: input.description ?? null,
      color: input.color ?? null,
      icon: input.icon ?? null,
      parentId: input.parentId ?? null,
    })
    .returning();

  if (!created) throw new Error("Failed to create folder");
  return created;
}

export type UpdateFolderPatch = {
  name?: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  parentId?: string | null;
};

export async function updateFolder(
  db: Database,
  userId: string,
  id: string,
  patch: UpdateFolderPatch,
): Promise<Folder | undefined> {
  const updateData: Partial<typeof folders.$inferInsert> = {};
  if (patch.name !== undefined) updateData.name = patch.name;
  if (patch.description !== undefined)
    updateData.description = patch.description;
  if (patch.color !== undefined) updateData.color = patch.color;
  if (patch.icon !== undefined) updateData.icon = patch.icon;
  if (patch.parentId !== undefined) updateData.parentId = patch.parentId;

  if (Object.keys(updateData).length === 0) {
    return getFolder(db, userId, id);
  }

  const [updated] = await db
    .update(folders)
    .set(updateData)
    .where(and(eq(folders.id, id), eq(folders.userId, userId)))
    .returning();

  return updated;
}

export async function deleteFolder(
  db: Database,
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await db
    .delete(folders)
    .where(and(eq(folders.id, id), eq(folders.userId, userId)))
    .returning({ id: folders.id });
  return result.length > 0;
}
