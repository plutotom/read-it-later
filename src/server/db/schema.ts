/**
 * Database schema for the read-it-later app
 * Defines all tables and relationships using Drizzle ORM
 */

import { sql } from "drizzle-orm";
import type { SourceAnchor } from "~/lib/native-annotations";
import type { WebAnchor } from "~/lib/annotation-anchor";
import { relations } from "drizzle-orm";
import { index, pgTableCreator, pgEnum, primaryKey } from "drizzle-orm/pg-core";
import {
  account,
  accountRelations,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
  userPreferences,
  themeEnum,
  ttsUsage,
  userPreferencesRelations,
} from "~/schemas/auth";

/**
 * Multi-project schema feature of Drizzle ORM
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `read-it-later_${name}`);

// Enums
export const highlightColorEnum = pgEnum("highlight_color", [
  "yellow",
  "green",
  "blue",
  "pink",
  "purple",
  "orange",
  "red",
  "gray",
]);

// Whether a highlight could be re-anchored against the current article content.
// "lost" highlights failed both offset and quote re-anchoring (e.g. the article
// was re-extracted and the text no longer exists) and are surfaced separately.
export const highlightAnchorStatusEnum = pgEnum("highlight_anchor_status", [
  "anchored",
  "lost",
]);

// Articles table
export const articles = createTable(
  "article",
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    userId: d
      .text()
      .notNull()
      .references(() => user.id),
    url: d.text().notNull(),
    title: d.text().notNull(),
    content: d.text().notNull(),
    shareToken: d.varchar({ length: 21 }).unique(), // nanoid for public sharing
    excerpt: d.text(),
    author: d.text(),
    publishedAt: d.timestamp({ withTimezone: true }),
    isFavorite: d.boolean().notNull().default(false),
    readAt: d.timestamp({ withTimezone: true }),
    isRead: d.boolean().notNull().default(false),
    isArchived: d.boolean().notNull().default(false),
    folderId: d.uuid(),
    wordCount: d.integer(),
    readingTime: d.integer(), // in minutes
    tags: d.text().array(),
    metadata: d.jsonb(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => new Date())
      .notNull(),
  }),
  (t) => [
    index("article_url_idx").on(t.url),
    index("article_share_token_idx").on(t.shareToken),
    index("article_folder_idx").on(t.folderId),
    index("article_created_at_idx").on(t.createdAt),
    index("article_is_favorite_idx").on(t.isFavorite),
    index("article_is_read_idx").on(t.isRead),
    index("article_is_archived_idx").on(t.isArchived),
    index("article_tags_idx").on(t.tags),
  ],
);

// Folders table
export const folders = createTable(
  "folder",
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    name: d.varchar({ length: 100 }).notNull(),
    description: d.text(),
    color: d.varchar({ length: 7 }), // #RRGGBB format
    icon: d.varchar({ length: 50 }),
    parentId: d.uuid(),
    isDefault: d.boolean().notNull().default(false),
    articleCount: d.integer().notNull().default(0),
    userId: d
      .text()
      .notNull()
      .references(() => user.id),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => new Date())
      .notNull(),
  }),
  (t) => [
    index("folder_parent_idx").on(t.parentId),
    index("folder_name_idx").on(t.name),
    index("folder_is_default_idx").on(t.isDefault),
  ],
);

// Highlights table
// Matches the Highlight interface in src/types/annotation.ts
export const highlights = createTable(
  "highlight",
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    userId: d
      .text()
      .notNull()
      .references(() => user.id),
    // Foreign key to article - required. Cascade so deleting an article removes
    // its highlights instead of orphaning them.
    articleId: d
      .uuid()
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    // The highlighted text content (TextQuote selector — the exact quote)
    text: d.text().notNull(),
    // Character offset where highlight starts in the normalized anchor text
    // (TextPosition selector — the fast path)
    startOffset: d.integer().notNull(),
    // Character offset where highlight ends in the normalized anchor text
    endOffset: d.integer().notNull(),
    // Highlight color from HighlightColor enum
    color: highlightColorEnum("color").notNull().default("yellow"),
    // Surrounding text used to disambiguate/re-anchor the quote when offsets
    // drift (TextQuote selector — prefix/suffix). Always populated by the client.
    contextPrefix: d.text(),
    contextSuffix: d.text(),
    // Anchoring-format version, so future algorithm changes can branch on it
    // at restore time without breaking existing highlights.
    version: d.integer().notNull().default(1),
    // Hash of the normalized anchor text at creation time. On load, if it still
    // matches the current content's hash, offsets are trusted directly (no
    // re-search); otherwise we fall back to quote/context re-anchoring.
    anchorContentHash: d.text(),
    // Result of the last re-anchoring attempt.
    anchorStatus: highlightAnchorStatusEnum("anchor_status")
      .notNull()
      .default("anchored"),
    // Original selector and a separately verified DOM projection. Native source
    // offsets must never be interpreted as legacy DOM offsets by the painter.
    anchorSpace: d
      .text()
      .$type<SourceAnchor["space"]>()
      .notNull()
      .default("web-dom-v1"),
    sourceAnchor: d.jsonb().$type<SourceAnchor>(),
    webAnchor: d.jsonb().$type<WebAnchor>(),
    // Tags for organizing highlights (optional)
    tags: d.text().array(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => new Date())
      .notNull(),
  }),
  (t) => [
    index("highlight_article_idx").on(t.articleId),
    index("highlight_created_at_idx").on(t.createdAt),
    index("highlight_article_created_idx").on(t.articleId, t.createdAt),
  ],
);

// Notes table
export const notes = createTable(
  "note",
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    userId: d
      .text()
      .notNull()
      .references(() => user.id),
    articleId: d
      .uuid()
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    // When set, this note belongs to a highlight; deleting the highlight removes
    // its attached notes. Null for standalone (article-level) notes.
    highlightId: d
      .uuid()
      .references(() => highlights.id, { onDelete: "cascade" }),
    content: d.text().notNull(),
    position: d.jsonb(), // { x: number, y: number, page?: number }
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => new Date())
      .notNull(),
  }),
  (t) => [
    index("note_article_idx").on(t.articleId),
    index("note_highlight_idx").on(t.highlightId),
    index("note_created_at_idx").on(t.createdAt),
  ],
);

// Para device exports — plain-text snapshots for e-reader sync
export const paraExports = createTable(
  "para_export",
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    userId: d
      .text()
      .notNull()
      .references(() => user.id),
    articleId: d.uuid().references(() => articles.id, { onDelete: "set null" }),
    title: d.text().notNull(),
    filename: d.text().notNull(),
    txtContent: d.text().notNull(),
    bytes: d.integer().notNull(),
    sha256: d.text().notNull(),
    contentHash: d.text().notNull(),
    gotoPage: d.integer(),
    gotoVersion: d.integer().notNull().default(0),
    gotoSetAt: d.timestamp({ withTimezone: true }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("para_export_user_idx").on(t.userId),
    index("para_export_article_idx").on(t.articleId),
    index("para_export_created_at_idx").on(t.createdAt),
  ],
);

// General-purpose API keys (device sync, future integrations)
export const apiKeys = createTable(
  "api_key",
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    userId: d
      .text()
      .notNull()
      .references(() => user.id),
    label: d.text().notNull(),
    keyPrefix: d.text().notNull(),
    keyHash: d.text().notNull(),
    scopes: d.text().array().notNull().default(["para:read"]),
    lastUsedAt: d.timestamp({ withTimezone: true }),
    revokedAt: d.timestamp({ withTimezone: true }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("api_key_user_idx").on(t.userId),
    index("api_key_hash_idx").on(t.keyHash),
  ],
);

// Article Audio table - for TTS audio caching and playback progress
export const articleAudio = createTable(
  "article_audio",
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    userId: d
      .text()
      .notNull()
      .references(() => user.id),
    articleId: d.uuid().notNull().unique(), // One audio per article
    audioUrl: d.text().notNull(), // Vercel Blob URL
    voiceName: d.text().notNull(), // e.g., "en-US-Standard-A"
    durationSeconds: d.real(), // Total audio length
    fileSizeBytes: d.integer(), // For UI display

    // Playback progress
    currentTimeSeconds: d.real().notNull().default(0),
    lastPlayedAt: d.timestamp({ withTimezone: true }),

    generatedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => new Date())
      .notNull(),
  }),
  (t) => [index("article_audio_article_idx").on(t.articleId)],
);

// Relations
export const articlesRelations = relations(articles, ({ one, many }) => ({
  user: one(user, {
    fields: [articles.userId],
    references: [user.id],
  }),
  folder: one(folders, {
    fields: [articles.folderId],
    references: [folders.id],
  }),
  highlights: many(highlights),
  notes: many(notes),
  audio: one(articleAudio),
  paraExports: many(paraExports),
}));

export const paraExportsRelations = relations(paraExports, ({ one }) => ({
  user: one(user, {
    fields: [paraExports.userId],
    references: [user.id],
  }),
  article: one(articles, {
    fields: [paraExports.articleId],
    references: [articles.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(user, {
    fields: [apiKeys.userId],
    references: [user.id],
  }),
}));

export const foldersRelations = relations(folders, ({ one, many }) => ({
  user: one(user, {
    fields: [folders.userId],
    references: [user.id],
  }),
  parent: one(folders, {
    fields: [folders.parentId],
    references: [folders.id],
    relationName: "parent_child",
  }),
  children: many(folders, {
    relationName: "parent_child",
  }),
  articles: many(articles),
}));

export const highlightsRelations = relations(highlights, ({ one, many }) => ({
  user: one(user, {
    fields: [highlights.userId],
    references: [user.id],
  }),
  article: one(articles, {
    fields: [highlights.articleId],
    references: [articles.id],
  }),
  notes: many(notes),
}));

export const notesRelations = relations(notes, ({ one }) => ({
  user: one(user, {
    fields: [notes.userId],
    references: [user.id],
  }),
  article: one(articles, {
    fields: [notes.articleId],
    references: [articles.id],
  }),
  highlight: one(highlights, {
    fields: [notes.highlightId],
    references: [highlights.id],
  }),
}));

export const articleAudioRelations = relations(articleAudio, ({ one }) => ({
  user: one(user, {
    fields: [articleAudio.userId],
    references: [user.id],
  }),
  article: one(articles, {
    fields: [articleAudio.articleId],
    references: [articles.id],
  }),
}));

// Auth tables (Better Auth)
export {
  user,
  session,
  account,
  verification,
  userPreferences,
  themeEnum,
  ttsUsage,
  userRelations,
  sessionRelations,
  accountRelations,
  userPreferencesRelations,
};

// Native speech is a separate, private artifact cache. No article text is stored here.
export const nativeSpeechCache = createTable("native_speech_cache", (d) => ({
  id: d.varchar({ length: 64 }).primaryKey(),
  state: d.text().notNull(),
  fence: d.uuid().notNull(),
  leaseUntil: d.timestamp({ withTimezone: true }).notNull(),
  blobUrl: d.text(),
  updatedAt: d.timestamp({ withTimezone: true }).notNull().defaultNow(),
}));
export const nativeSpeechOrphans = createTable("native_speech_orphan", (d) => ({
  url: d.text().primaryKey(),
  createdAt: d.timestamp({ withTimezone: true }).notNull().defaultNow(),
}));

// Admission counts for web streaming. Provider failures can still incur charges.
export const listeningUsage = createTable(
  "listening_usage",
  (d) => ({
    userId: d
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    window: d.varchar({ length: 32 }).notNull(),
    characters: d.integer().notNull().default(0),
    requests: d.integer().notNull().default(0),
  }),
  (t) => [primaryKey({ columns: [t.userId, t.window] })],
);

// Authenticated web accounting lives in the web DB, even when audio uses a separate speech DB.
export const audioJobs = createTable("audio_job", (d) => ({
  id: d.text().primaryKey(),
  userId: d.text().references(() => user.id, { onDelete: "set null" }),
  articleId: d.uuid().references(() => articles.id, { onDelete: "set null" }),
  environment: d.text().notNull(),
  path: d.text().notNull(),
  allowanceUnits: d.integer().notNull().default(0),
  allowancePeriod: d.text().notNull(),
  state: d.text().notNull(),
  fence: d.uuid().notNull(),
  leaseUntil: d.timestamp({ withTimezone: true }).notNull(),
  cacheState: d.text().notNull().default("pending"),
  createdAt: d.timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: d.timestamp({ withTimezone: true }).notNull().defaultNow(),
}));
export const audioAttempts = createTable(
  "audio_attempt",
  (d) => ({
    id: d.uuid().primaryKey(),
    jobId: d
      .text()
      .notNull()
      .references(() => audioJobs.id),
    userId: d.text().references(() => user.id, { onDelete: "set null" }),
    environment: d.text().notNull(),
    providerAccount: d.text().notNull(),
    provider: d.text().notNull(),
    model: d.text().notNull(),
    voice: d.text().notNull(),
    payloadHash: d.text().notNull(),
    unit: d.text().notNull(),
    requestedUnits: d.integer().notNull(),
    reportedUnits: d.integer(),
    measurement: d.text().notNull(),
    state: d.text().notNull().default("dispatched"),
    rateVersion: d.text(),
    usdPerMillion: d.numeric({ precision: 24, scale: 9 }),
    estimatedUsd: d.numeric({ precision: 30, scale: 15 }),
    audioBytes: d.integer().notNull().default(0),
    durationSeconds: d.real(),
    startedAt: d.timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [
    index("audio_attempt_user_date_idx").on(t.userId, t.startedAt),
    index("audio_attempt_job_idx").on(t.jobId),
    index("audio_attempt_date_idx").on(t.startedAt),
  ],
);
export const audioEvents = createTable("audio_event", (d) => ({
  id: d.text().primaryKey(),
  jobId: d
    .text()
    .notNull()
    .references(() => audioJobs.id),
  attemptId: d.uuid().references(() => audioAttempts.id),
  kind: d.text().notNull(),
  units: d.integer(),
  createdAt: d.timestamp({ withTimezone: true }).notNull().defaultNow(),
}));
export const audioBilling = createTable("audio_billing", (d) => ({
  id: d.text().primaryKey(),
  provider: d.text().notNull(),
  providerAccount: d.text().notNull(),
  environment: d.text().notNull(),
  period: d.text().notNull(),
  invoiceMonth: d.text().notNull(),
  sku: d.text().notNull(),
  model: d.text().notNull(),
  currency: d.text().notNull(),
  gross: d.numeric({ precision: 30, scale: 15 }).notNull(),
  credits: d.numeric({ precision: 30, scale: 15 }).notNull(),
  net: d.numeric({ precision: 30, scale: 15 }).notNull(),
  importedAt: d.timestamp({ withTimezone: true }).notNull().defaultNow(),
}));

export const audioHistory = createTable("audio_history", (d) => ({
  id: d.text().primaryKey(),
  userId: d.text().references(() => user.id, { onDelete: "set null" }),
  period: d.text().notNull(),
  source: d.text().notNull(),
  admittedUnits: d.integer().notNull(),
  rawUnits: d.integer().notNull(),
  capturedAt: d.timestamp({ withTimezone: true }).notNull().defaultNow(),
}));
export const audioAccountingCoverage = createTable(
  "audio_accounting_coverage",
  (d) => ({
    id: d.text().primaryKey(),
    startedAt: d.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
);

export const audioCacheDeliveries = createTable(
  "audio_cache_delivery",
  (d) => ({
    id: d.uuid().primaryKey(),
    userId: d.text().references(() => user.id, { onDelete: "set null" }),
    articleId: d.uuid().references(() => articles.id, { onDelete: "set null" }),
    artifactId: d.text().notNull(),
    environment: d.text().notNull(),
    createdAt: d.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
);
export const audioBillingImports = createTable("audio_billing_import", (d) => ({
  id: d.text().primaryKey(),
  source: d.text().notNull(),
  snapshot: d.jsonb().notNull(),
  importedAt: d.timestamp({ withTimezone: true }).notNull().defaultNow(),
}));

export const audioReservations = createTable("audio_reservation", (d) => ({
  id: d.uuid().primaryKey(),
  jobId: d
    .text()
    .notNull()
    .references(() => audioJobs.id),
  userId: d.text().references(() => user.id, { onDelete: "set null" }),
  path: d.text().notNull(),
  period: d.text().notNull(),
  admittedAt: d.timestamp({ withTimezone: true }).notNull(),
  reservedUnits: d.integer().notNull(),
  rawUnits: d.integer().notNull(),
  dispatchedUnits: d.integer().notNull().default(0),
  rawDispatched: d.integer().notNull().default(0),
  settled: d.boolean().notNull().default(false),
}));

// Existing 0015 owner counter. Annotation FK/locking shares this exact row.
export const nativeLibraryOwners = createTable("native_library_owner", (d) => ({
  ownerId: d
    .text("owner_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  revision: d.bigint({ mode: "bigint" }).notNull().default(0n),
}));

// Permanent annotation identities/tombstones; intentionally no child/parent FK.
export const nativeAnnotations = createTable(
  "native_annotation",
  (d) => ({
    ownerId: d
      .text("owner_id")
      .notNull()
      .references(() => nativeLibraryOwners.ownerId, { onDelete: "cascade" }),
    kind: d.text().$type<"note" | "highlight">().notNull(),
    id: d.uuid().notNull(),
    articleId: d.uuid("article_id").notNull(),
    deleted: d.boolean().notNull(),
  }),
  (t) => [
    primaryKey({ columns: [t.ownerId, t.kind, t.id, t.articleId] }),
    index("native_annotation_article_idx").on(t.ownerId, t.articleId),
  ],
);
