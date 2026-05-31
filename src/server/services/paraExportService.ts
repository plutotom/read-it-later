import { and, asc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { db as Db } from "~/server/db";
import { articles, paraExports } from "~/server/db/schema";
import {
  resolveUniqueFilename,
  sanitizeTxtFilename,
} from "~/server/lib/paraFilename";
import { PARA_SIZE_WARNING_BYTES } from "~/lib/paraConstants";
import { buildParaTxtFromArticle } from "~/server/services/paraTextConverter";

type Database = typeof Db;

export type ParaManifestBook = {
  id: string;
  name: string;
  url: string;
  sha256: string;
  bytes: number;
  goto_page?: number;
  goto_version?: number;
};

const GOTO_PAGE_MAX = 99_999;

export function manifestBookFromExport(
  row: typeof paraExports.$inferSelect,
  baseUrl: string,
): ParaManifestBook {
  const book: ParaManifestBook = {
    id: row.id,
    name: row.filename,
    url: `${baseUrl.replace(/\/$/, "")}/api/para/articles/${row.id}`,
    sha256: row.sha256,
    bytes: row.bytes,
  };

  if (row.gotoPage != null && row.gotoPage >= 1) {
    book.goto_page = row.gotoPage;
    book.goto_version = row.gotoVersion;
  }

  return book;
}

export type ParaManifest = {
  version: 1;
  books: ParaManifestBook[];
};

export function isParaExportLarge(bytes: number): boolean {
  return bytes > PARA_SIZE_WARNING_BYTES;
}

async function getTakenFilenames(
  db: Database,
  userId: string,
  excludeExportId?: string,
): Promise<Set<string>> {
  const rows = await db.query.paraExports.findMany({
    where: excludeExportId
      ? and(
          eq(paraExports.userId, userId),
          ne(paraExports.id, excludeExportId),
        )
      : eq(paraExports.userId, userId),
    columns: { filename: true },
  });

  return new Set(rows.map((row) => row.filename));
}

export async function refreshExportFromArticle(
  db: Database,
  exportRow: typeof paraExports.$inferSelect,
  article: typeof articles.$inferSelect,
): Promise<typeof paraExports.$inferSelect> {
  const converted = buildParaTxtFromArticle(article.title, article.content);

  if (
    exportRow.contentHash === converted.contentHash &&
    exportRow.title === article.title &&
    exportRow.txtContent === converted.txtContent
  ) {
    return exportRow;
  }

  const takenFilenames = await getTakenFilenames(db, exportRow.userId, exportRow.id);
  const baseFilename = sanitizeTxtFilename(article.title);
  const filename =
    exportRow.filename.startsWith(baseFilename.replace(".txt", "")) &&
    exportRow.title === article.title
      ? exportRow.filename
      : resolveUniqueFilename(baseFilename, takenFilenames);

  const [updated] = await db
    .update(paraExports)
    .set({
      title: article.title,
      filename,
      txtContent: converted.txtContent,
      bytes: converted.bytes,
      sha256: converted.sha256,
      contentHash: converted.contentHash,
    })
    .where(eq(paraExports.id, exportRow.id))
    .returning();

  return updated ?? exportRow;
}

export async function ensureFreshExport(
  db: Database,
  exportRow: typeof paraExports.$inferSelect,
): Promise<typeof paraExports.$inferSelect> {
  if (!exportRow.articleId) {
    return exportRow;
  }

  const article = await db.query.articles.findFirst({
    where: and(
      eq(articles.id, exportRow.articleId),
      eq(articles.userId, exportRow.userId),
    ),
  });

  if (!article) {
    return exportRow;
  }

  return refreshExportFromArticle(db, exportRow, article);
}

export async function createParaExport(
  db: Database,
  userId: string,
  articleId: string,
) {
  const article = await db.query.articles.findFirst({
    where: and(eq(articles.id, articleId), eq(articles.userId, userId)),
  });

  if (!article) {
    throw new Error("Article not found");
  }

  const existing = await db.query.paraExports.findFirst({
    where: and(
      eq(paraExports.userId, userId),
      eq(paraExports.articleId, articleId),
    ),
  });

  if (existing) {
    return ensureFreshExport(db, existing);
  }

  const converted = buildParaTxtFromArticle(article.title, article.content);
  const takenFilenames = await getTakenFilenames(db, userId);
  const filename = resolveUniqueFilename(
    sanitizeTxtFilename(article.title),
    takenFilenames,
  );

  const [created] = await db
    .insert(paraExports)
    .values({
      userId,
      articleId,
      title: article.title,
      filename,
      txtContent: converted.txtContent,
      bytes: converted.bytes,
      sha256: converted.sha256,
      contentHash: converted.contentHash,
    })
    .returning();

  if (!created) {
    throw new Error("Failed to create Para export");
  }

  return created;
}

export async function removeParaExportByArticleId(
  db: Database,
  userId: string,
  articleId: string,
) {
  const result = await db
    .delete(paraExports)
    .where(
      and(
        eq(paraExports.userId, userId),
        eq(paraExports.articleId, articleId),
      ),
    )
    .returning({ id: paraExports.id });

  return result.length > 0;
}

export async function removeParaExportById(
  db: Database,
  userId: string,
  exportId: string,
) {
  const result = await db
    .delete(paraExports)
    .where(and(eq(paraExports.id, exportId), eq(paraExports.userId, userId)))
    .returning({ id: paraExports.id });

  return result.length > 0;
}

export async function listParaExports(db: Database, userId: string) {
  const rows = await db.query.paraExports.findMany({
    where: eq(paraExports.userId, userId),
    orderBy: [asc(paraExports.createdAt)],
  });

  return rows.map((row) => ({
    ...row,
    isLarge: isParaExportLarge(row.bytes),
  }));
}

export async function getParaArticleStatuses(
  db: Database,
  userId: string,
  articleIds: string[],
): Promise<Record<string, boolean>> {
  if (articleIds.length === 0) return {};

  const rows = await db.query.paraExports.findMany({
    where: and(
      eq(paraExports.userId, userId),
      inArray(paraExports.articleId, articleIds),
      isNotNull(paraExports.articleId),
    ),
    columns: { articleId: true },
  });

  const statuses: Record<string, boolean> = {};
  for (const id of articleIds) {
    statuses[id] = false;
  }
  for (const row of rows) {
    if (row.articleId) {
      statuses[row.articleId] = true;
    }
  }

  return statuses;
}

export async function getTotalParaBytes(db: Database, userId: string) {
  const [result] = await db
    .select({
      total: sql<number>`coalesce(sum(${paraExports.bytes}), 0)::int`,
    })
    .from(paraExports)
    .where(eq(paraExports.userId, userId));

  return result?.total ?? 0;
}

export async function buildManifestForUser(
  db: Database,
  userId: string,
  baseUrl: string,
): Promise<ParaManifest> {
  const rows = await db.query.paraExports.findMany({
    where: eq(paraExports.userId, userId),
    orderBy: [asc(paraExports.filename)],
  });

  const freshRows = await Promise.all(
    rows.map((row) => ensureFreshExport(db, row)),
  );

  const books: ParaManifestBook[] = freshRows
    .map((row) => manifestBookFromExport(row, baseUrl))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { version: 1, books };
}

export async function getExportForDownload(
  db: Database,
  userId: string,
  exportId: string,
) {
  const row = await db.query.paraExports.findFirst({
    where: and(eq(paraExports.id, exportId), eq(paraExports.userId, userId)),
  });

  if (!row) return null;

  return ensureFreshExport(db, row);
}

export async function setParaGotoPage(
  db: Database,
  userId: string,
  exportId: string,
  page: number,
) {
  if (!Number.isInteger(page) || page < 1 || page > GOTO_PAGE_MAX) {
    throw new Error(
      `Page must be an integer between 1 and ${GOTO_PAGE_MAX.toLocaleString()}`,
    );
  }

  const row = await db.query.paraExports.findFirst({
    where: and(eq(paraExports.id, exportId), eq(paraExports.userId, userId)),
  });

  if (!row) {
    throw new Error("Export not found");
  }

  const [updated] = await db
    .update(paraExports)
    .set({
      gotoPage: page,
      gotoVersion: row.gotoVersion + 1,
      gotoSetAt: new Date(),
    })
    .where(eq(paraExports.id, exportId))
    .returning();

  if (!updated) {
    throw new Error("Failed to update goto page");
  }

  return updated;
}

export async function clearParaGotoPage(
  db: Database,
  userId: string,
  exportId: string,
) {
  const [updated] = await db
    .update(paraExports)
    .set({
      gotoPage: null,
      gotoSetAt: null,
    })
    .where(
      and(eq(paraExports.id, exportId), eq(paraExports.userId, userId)),
    )
    .returning();

  if (!updated) {
    throw new Error("Export not found");
  }

  return updated;
}
