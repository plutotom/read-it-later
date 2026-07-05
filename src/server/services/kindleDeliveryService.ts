import { and, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { db as Db } from "~/server/db";
import { articles, kindleDeliveries, userPreferences } from "~/server/db/schema";
import { env } from "~/env";
import {
  buildSenderEmail,
  isValidKindleEmail,
  KINDLE_MAX_ATTACHMENT_BYTES,
} from "~/lib/kindleConstants";
import type { KindleSettings } from "~/schemas/kindle";
import { isPdfArticle, PDF_UNSUPPORTED_PARA_MESSAGE } from "~/lib/article-content-kind";
import {
  buildKindleHtmlDocument,
  sanitizeDeliveryFilename,
} from "~/server/services/deliveryConverter";
import { sendDocumentEmail } from "~/server/services/delivery/emailTransport";

type Database = typeof Db;

export class KindleNotConfiguredError extends Error {
  constructor(message = "Kindle email is not configured") {
    super(message);
    this.name = "KindleNotConfiguredError";
  }
}

export class UnsupportedKindleContentError extends Error {
  constructor(message = PDF_UNSUPPORTED_PARA_MESSAGE) {
    super(message);
    this.name = "UnsupportedKindleContentError";
  }
}

function getDeliveryDomain(): string {
  if (env.DELIVERY_FROM_DOMAIN) {
    return env.DELIVERY_FROM_DOMAIN;
  }

  try {
    const host = new URL(env.AUTH_URL).hostname;
    if (!host.endsWith(".vercel.app")) {
      return host;
    }
  } catch {
    // fall through
  }

  return "read-it-later.app";
}

function buildFromAddress(setup: {
  fromDisplayName: string;
  senderEmail: string;
}): string {
  const configured = env.DELIVERY_FROM_EMAIL?.trim();
  if (configured) {
    return configured.includes("<")
      ? configured
      : `${setup.fromDisplayName} <${configured}>`;
  }

  return `${setup.fromDisplayName} <${setup.senderEmail}>`;
}

function getFromDisplayName(): string {
  return env.DELIVERY_FROM_NAME;
}

function parseKindleSettings(
  settings: Record<string, unknown> | null | undefined,
): KindleSettings | null {
  const raw = settings?.kindle;
  if (!raw || typeof raw !== "object") return null;

  const record = raw as Record<string, unknown>;
  if (typeof record.senderToken !== "string" || !record.senderToken) return null;

  return {
    senderToken: record.senderToken,
    kindleEmail:
      typeof record.kindleEmail === "string" ? record.kindleEmail : null,
    connectedAt:
      typeof record.connectedAt === "string" ? record.connectedAt : null,
  };
}

async function ensureUserPreferences(db: Database, userId: string) {
  const existing = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
  });

  if (existing) return existing;

  const id = crypto.randomUUID();
  await db.insert(userPreferences).values({
    id,
    userId,
    theme: "light",
    settings: {},
  });

  return {
    id,
    userId,
    theme: "light" as const,
    ttsVoiceName: "en-US-Standard-A",
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function getKindleSetup(db: Database, userId: string) {
  const prefs = await ensureUserPreferences(db, userId);
  const domain = getDeliveryDomain();
  const existing = parseKindleSettings(prefs.settings);

  const senderToken = existing?.senderToken ?? nanoid(8);
  const senderEmail = buildSenderEmail(senderToken, domain);

  if (!existing) {
    const nextSettings = {
      ...(prefs.settings ?? {}),
      kindle: {
        senderToken,
        kindleEmail: null,
        connectedAt: null,
      },
    };

    await db
      .update(userPreferences)
      .set({ settings: nextSettings })
      .where(eq(userPreferences.userId, userId));
  }

  const kindle = existing ?? {
    senderToken,
    kindleEmail: null,
    connectedAt: null,
  };

  return {
    senderEmail,
    senderToken: kindle.senderToken,
    kindleEmail: kindle.kindleEmail,
    isConnected: Boolean(kindle.kindleEmail && kindle.connectedAt),
    connectedAt: kindle.connectedAt,
    fromDisplayName: getFromDisplayName(),
    deliveryDomain: domain,
    emailConfigured: Boolean(env.RESEND_API_KEY),
  };
}

export async function saveKindleEmail(
  db: Database,
  userId: string,
  kindleEmail: string,
) {
  const trimmed = kindleEmail.trim();
  if (!isValidKindleEmail(trimmed)) {
    throw new Error(
      "Enter a valid Kindle email address (usually ends with @kindle.com).",
    );
  }

  const setup = await getKindleSetup(db, userId);
  const prefs = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
  });

  const nextSettings = {
    ...(prefs?.settings ?? {}),
    kindle: {
      senderToken: setup.senderToken,
      kindleEmail: trimmed,
      connectedAt: new Date().toISOString(),
    },
  };

  await db
    .update(userPreferences)
    .set({ settings: nextSettings })
    .where(eq(userPreferences.userId, userId));

  return getKindleSetup(db, userId);
}

export async function clearKindleEmail(db: Database, userId: string) {
  const setup = await getKindleSetup(db, userId);
  const prefs = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
  });

  const nextSettings = {
    ...(prefs?.settings ?? {}),
    kindle: {
      senderToken: setup.senderToken,
      kindleEmail: null,
      connectedAt: null,
    },
  };

  await db
    .update(userPreferences)
    .set({ settings: nextSettings })
    .where(eq(userPreferences.userId, userId));

  return getKindleSetup(db, userId);
}

export type KindleDeliveryApi = {
  id: string;
  articleId: string | null;
  articleTitle: string | null;
  status: string;
  filename: string;
  bytes: number;
  sentAt: Date | null;
  createdAt: Date;
  errorMessage: string | null;
};

export function serializeKindleDeliveryForApi(
  row: typeof kindleDeliveries.$inferSelect & { articleTitle?: string | null },
): KindleDeliveryApi {
  return {
    id: row.id,
    articleId: row.articleId,
    articleTitle: row.articleTitle ?? null,
    status: row.status,
    filename: row.filename,
    bytes: row.bytes,
    sentAt: row.sentAt,
    createdAt: row.createdAt,
    errorMessage: row.errorMessage,
  };
}

export async function listKindleDeliveries(
  db: Database,
  userId: string,
  limit = 50,
): Promise<KindleDeliveryApi[]> {
  const rows = await db.query.kindleDeliveries.findMany({
    where: eq(kindleDeliveries.userId, userId),
    orderBy: [desc(kindleDeliveries.createdAt)],
    limit,
    with: {
      article: {
        columns: { title: true },
      },
    },
  });

  return rows.map((row) =>
    serializeKindleDeliveryForApi({
      ...row,
      articleTitle: row.article?.title ?? null,
    }),
  );
}

export async function getKindleArticleStatuses(
  db: Database,
  userId: string,
  articleIds: string[],
): Promise<Record<string, "sent" | "failed" | "pending" | false>> {
  if (articleIds.length === 0) return {};

  const rows = await db.query.kindleDeliveries.findMany({
    where: and(
      eq(kindleDeliveries.userId, userId),
      inArray(kindleDeliveries.articleId, articleIds),
    ),
    orderBy: [desc(kindleDeliveries.createdAt)],
  });

  const result: Record<string, "sent" | "failed" | "pending" | false> = {};
  for (const id of articleIds) {
    result[id] = false;
  }

  for (const row of rows) {
    if (!row.articleId) continue;
    if (result[row.articleId] !== false) continue;

    if (row.status === "sent" || row.status === "failed" || row.status === "pending") {
      result[row.articleId] = row.status;
    }
  }

  return result;
}

async function getArticleForUser(
  db: Database,
  userId: string,
  articleId: string,
) {
  return db.query.articles.findFirst({
    where: and(eq(articles.id, articleId), eq(articles.userId, userId)),
  });
}

export async function sendArticleToKindle(
  db: Database,
  userId: string,
  articleId: string,
  opts?: { force?: boolean },
) {
  const setup = await getKindleSetup(db, userId);
  if (!setup.kindleEmail) {
    throw new KindleNotConfiguredError();
  }

  const article = await getArticleForUser(db, userId, articleId);
  if (!article) {
    throw new Error("Article not found");
  }

  if (isPdfArticle(article)) {
    throw new UnsupportedKindleContentError();
  }

  const document = buildKindleHtmlDocument({
    title: article.title,
    author: article.author,
    url: article.url,
    contentHtml: article.content,
  });

  if (document.bytes > KINDLE_MAX_ATTACHMENT_BYTES) {
    throw new Error("Article is too large to send via Kindle email.");
  }

  if (!opts?.force) {
    const existing = await db.query.kindleDeliveries.findFirst({
      where: and(
        eq(kindleDeliveries.userId, userId),
        eq(kindleDeliveries.articleId, articleId),
        eq(kindleDeliveries.status, "sent"),
        eq(kindleDeliveries.contentHash, document.contentHash),
      ),
      orderBy: [desc(kindleDeliveries.createdAt)],
    });

    if (existing) {
      return existing;
    }
  }

  const filename = sanitizeDeliveryFilename(article.title);
  const fromAddress = buildFromAddress(setup);

  const [delivery] = await db
    .insert(kindleDeliveries)
    .values({
      userId,
      articleId,
      kindleEmail: setup.kindleEmail,
      senderEmail: setup.senderEmail,
      format: "html",
      filename,
      bytes: document.bytes,
      contentHash: document.contentHash,
      status: "pending",
    })
    .returning();

  if (!delivery) {
    throw new Error("Failed to create delivery record");
  }

  try {
    const result = await sendDocumentEmail({
      from: fromAddress,
      to: setup.kindleEmail,
      subject: article.title.slice(0, 200),
      attachment: {
        filename,
        content: Buffer.from(document.html, "utf8"),
        contentType: "text/html",
      },
    });

    const [updated] = await db
      .update(kindleDeliveries)
      .set({
        status: "sent",
        externalId: result.messageId,
        sentAt: new Date(),
        errorMessage: result.mode === "mock" ? "Mock send (no RESEND_API_KEY)" : null,
      })
      .where(eq(kindleDeliveries.id, delivery.id))
      .returning();

    return updated ?? delivery;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown email send error";

    await db
      .update(kindleDeliveries)
      .set({
        status: "failed",
        errorMessage: message,
      })
      .where(eq(kindleDeliveries.id, delivery.id));

    throw new Error(message);
  }
}

export async function sendKindleTestDocument(db: Database, userId: string) {
  const setup = await getKindleSetup(db, userId);
  if (!setup.kindleEmail) {
    throw new KindleNotConfiguredError();
  }

  const html = buildKindleHtmlDocument({
    title: "Read It Later — Kindle test",
    author: "Read It Later",
    url: env.AUTH_URL,
    contentHtml:
      "<p>If you can read this on your Kindle, your Send to Kindle setup is working.</p><p>You can now send articles from your library.</p>",
  }).html;

  const fromAddress = buildFromAddress(setup);

  return sendDocumentEmail({
    from: fromAddress,
    to: setup.kindleEmail,
    subject: "Read It Later — Kindle test",
    attachment: {
      filename: "read-it-later-kindle-test.html",
      content: Buffer.from(html, "utf8"),
      contentType: "text/html",
    },
  });
}

export async function retryKindleDelivery(
  db: Database,
  userId: string,
  deliveryId: string,
) {
  const row = await db.query.kindleDeliveries.findFirst({
    where: and(
      eq(kindleDeliveries.id, deliveryId),
      eq(kindleDeliveries.userId, userId),
    ),
  });

  if (!row?.articleId) {
    throw new Error("Delivery not found");
  }

  if (row.status !== "failed") {
    throw new Error("Only failed deliveries can be retried");
  }

  return sendArticleToKindle(db, userId, row.articleId, { force: true });
}
