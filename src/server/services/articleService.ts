/**
 * Article service — single source of truth for article reads/writes.
 *
 * Both the tRPC router (`src/server/api/routers/article.ts`) and the public
 * REST API (`/api/v1/articles`) call these functions so the two surfaces never
 * drift. Every function scopes its queries to `userId`.
 */
import { and, arrayContains, eq, ilike, lt, or, sql } from "drizzle-orm";
import { JSDOM } from "jsdom";
import { nanoid } from "nanoid";
import type { db as Db } from "~/server/db";
import { articles, paraExports } from "~/server/db/schema";
import { normalizeManualArticleContent } from "~/server/services/articleContentNormalizer";
import { ArticleExtractor } from "~/server/services/articleExtractor";
import { refreshExportFromArticle } from "~/server/services/paraExportService";
import {
  countArticleWords,
  readingTimeFromWordCount,
} from "~/server/lib/articleWordCount";
import type {
  ArticleCreateFromTextInput,
  ArticleCreateInput,
} from "~/schemas/article";

type Database = typeof Db;
type Article = typeof articles.$inferSelect;

export type ListArticlesOptions = {
  isArchived?: boolean;
  isRead?: boolean;
  isFavorite?: boolean;
  folderId?: string;
  tag?: string;
  /** Case-insensitive substring match across title, excerpt and content. */
  q?: string;
  /** When set, results are paginated and a `nextCursor` is returned. */
  limit?: number;
  cursor?: string;
};

export type ListArticlesResult = {
  data: Article[];
  nextCursor: string | null;
};

// Opaque cursor encodes (createdAt, id) of the last returned row.
function encodeCursor(article: Article): string {
  return Buffer.from(
    `${article.createdAt.toISOString()}|${article.id}`,
    "utf8",
  ).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = decoded.lastIndexOf("|");
    if (sep === -1) return null;
    const createdAt = new Date(decoded.slice(0, sep));
    const id = decoded.slice(sep + 1);
    if (Number.isNaN(createdAt.getTime()) || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export async function listArticles(
  db: Database,
  userId: string,
  opts: ListArticlesOptions = {},
): Promise<ListArticlesResult> {
  const conditions = [eq(articles.userId, userId)];

  if (opts.isArchived !== undefined) {
    conditions.push(eq(articles.isArchived, opts.isArchived));
  }
  if (opts.isRead !== undefined) {
    conditions.push(eq(articles.isRead, opts.isRead));
  }
  if (opts.isFavorite !== undefined) {
    conditions.push(eq(articles.isFavorite, opts.isFavorite));
  }
  if (opts.folderId !== undefined) {
    conditions.push(eq(articles.folderId, opts.folderId));
  }
  if (opts.tag !== undefined) {
    conditions.push(arrayContains(articles.tags, [opts.tag]));
  }
  if (opts.q && opts.q.trim().length > 0) {
    const pattern = `%${opts.q.trim()}%`;
    const textMatch = or(
      ilike(articles.title, pattern),
      ilike(articles.excerpt, pattern),
      ilike(articles.content, pattern),
    );
    if (textMatch) conditions.push(textMatch);
  }

  if (opts.cursor) {
    const decoded = decodeCursor(opts.cursor);
    if (!decoded) {
      return { data: [], nextCursor: null };
    }
    // (createdAt, id) descending keyset pagination
    const keyset = or(
        lt(articles.createdAt, decoded.createdAt),
        and(
          eq(articles.createdAt, decoded.createdAt),
          lt(articles.id, decoded.id),
        ),
      );
      if (keyset) conditions.push(keyset);
  }

  const limit = opts.limit;
  const rows = await db.query.articles.findMany({
    where: and(...conditions),
    orderBy: (t, { desc }) => [desc(t.createdAt), desc(t.id)],
    // fetch one extra to know whether another page exists
    limit: limit === undefined ? undefined : limit + 1,
  });

  if (limit === undefined) {
    return { data: rows, nextCursor: null };
  }

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  return {
    data,
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  };
}

export async function getArticle(
  db: Database,
  userId: string,
  id: string,
): Promise<Article | undefined> {
  return db.query.articles.findFirst({
    where: and(eq(articles.id, id), eq(articles.userId, userId)),
  });
}

export async function createArticleFromUrl(
  db: Database,
  userId: string,
  input: ArticleCreateInput,
): Promise<Article> {
  const extracted = await ArticleExtractor.extractFromUrl(input.url);

  const [created] = await db
    .insert(articles)
    .values({
      userId,
      url: input.url,
      title: extracted.title,
      content: extracted.content,
      excerpt: extracted.excerpt ?? null,
      author: extracted.author ?? null,
      publishedAt: extracted.publishedAt ?? null,
      wordCount: extracted.wordCount ?? null,
      readingTime: extracted.readingTime ?? null,
      folderId: input.folderId ?? null,
      tags: input.tags ?? null,
      metadata: extracted.metadata ?? null,
    })
    .returning();

  if (!created) throw new Error("Failed to create article");
  return created;
}

export async function createArticleFromText(
  db: Database,
  userId: string,
  input: ArticleCreateFromTextInput,
): Promise<Article> {
  const placeholderUrl = `text://manual-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 11)}`;
  const articleUrl = input.url ?? placeholderUrl;
  const htmlContent = normalizeManualArticleContent(input.content);

  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;
  const plainText = document.textContent ?? "";
  const wordCount = countArticleWords(plainText);
  const readingTime = readingTimeFromWordCount(wordCount);

  const firstParagraph = document.querySelector("p");
  const excerpt =
    firstParagraph?.textContent?.trim() ??
    plainText.substring(0, 200).trim();

  const [created] = await db
    .insert(articles)
    .values({
      userId,
      url: articleUrl,
      title: input.title,
      content: htmlContent,
      excerpt: excerpt.length > 0 ? excerpt : null,
      author: input.author ?? null,
      publishedAt: input.publishedAt ?? null,
      wordCount,
      readingTime,
      folderId: input.folderId ?? null,
      tags: input.tags ?? null,
      metadata: {
        siteName: "Manual Entry",
        siteUrl: articleUrl,
        description: excerpt,
        language: "en",
        category: "Manual Entry",
      },
    })
    .returning();

  if (!created) throw new Error("Failed to create article");
  return created;
}

export type UpdateArticlePatch = {
  title?: string;
  url?: string;
  folderId?: string | null;
  tags?: string[] | null;
  isFavorite?: boolean;
  isRead?: boolean;
  isArchived?: boolean;
};

export async function updateArticle(
  db: Database,
  userId: string,
  id: string,
  patch: UpdateArticlePatch,
): Promise<Article | undefined> {
  const updateData: Partial<typeof articles.$inferInsert> = {};
  if (patch.title !== undefined) updateData.title = patch.title;
  if (patch.url !== undefined) updateData.url = patch.url;
  if (patch.folderId !== undefined) updateData.folderId = patch.folderId;
  if (patch.tags !== undefined) updateData.tags = patch.tags;
  if (patch.isFavorite !== undefined) updateData.isFavorite = patch.isFavorite;
  if (patch.isArchived !== undefined) updateData.isArchived = patch.isArchived;
  if (patch.isRead !== undefined) {
    updateData.isRead = patch.isRead;
    updateData.readAt = patch.isRead ? new Date() : null;
  }

  if (Object.keys(updateData).length === 0) {
    return getArticle(db, userId, id);
  }

  const [updated] = await db
    .update(articles)
    .set(updateData)
    .where(and(eq(articles.id, id), eq(articles.userId, userId)))
    .returning();

  // Keep the e-reader export's title/content in sync when the title changes.
  if (updated && patch.title !== undefined) {
    const exportRow = await db.query.paraExports.findFirst({
      where: and(
        eq(paraExports.articleId, updated.id),
        eq(paraExports.userId, userId),
      ),
    });
    if (exportRow) {
      await refreshExportFromArticle(db, exportRow, updated);
    }
  }

  return updated;
}

export async function deleteArticle(
  db: Database,
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await db
    .delete(articles)
    .where(and(eq(articles.id, id), eq(articles.userId, userId)))
    .returning({ id: articles.id });
  return result.length > 0;
}

/** Returns the article's share token, creating one if it doesn't exist. */
export async function generateShareLink(
  db: Database,
  userId: string,
  id: string,
): Promise<string> {
  const article = await db.query.articles.findFirst({
    where: and(eq(articles.id, id), eq(articles.userId, userId)),
    columns: { id: true, shareToken: true },
  });

  if (!article) throw new Error("Article not found");
  if (article.shareToken) return article.shareToken;

  const token = nanoid();
  await db
    .update(articles)
    .set({ shareToken: token })
    .where(and(eq(articles.id, id), eq(articles.userId, userId)));

  return token;
}

export type TagCount = { tag: string; count: number };

/** Distinct tags across the user's articles, with article counts. */
export async function listTags(
  db: Database,
  userId: string,
): Promise<TagCount[]> {
  const rows = await db.execute<{ tag: string; count: number }>(sql`
    SELECT tag, count(*)::int AS count
    FROM (
      SELECT unnest(${articles.tags}) AS tag
      FROM ${articles}
      WHERE ${articles.userId} = ${userId}
    ) AS t
    GROUP BY tag
    ORDER BY count DESC, tag ASC
  `);

  return Array.from(rows).map((r) => ({ tag: r.tag, count: Number(r.count) }));
}
