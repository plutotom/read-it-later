/**
 * Database schema for the read-it-later app
 * Defines all tables and relationships using Drizzle ORM
 */

import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import { index, pgTableCreator, pgEnum } from "drizzle-orm/pg-core";
import {
  account,
  accountRelations,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
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

// Articles table
export const articles = createTable(
  "article",
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    url: d.text().notNull(),
    title: d.text().notNull(),
    content: d.text().notNull(),
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
    userId: d.uuid(), // For future multi-user support
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
    // Foreign key to article - required
    articleId: d.uuid().notNull(),
    // The highlighted text content
    text: d.text().notNull(),
    // Character offset where highlight starts in article content
    startOffset: d.integer().notNull(),
    // Character offset where highlight ends in article content
    endOffset: d.integer().notNull(),
    // Highlight color from HighlightColor enum
    color: highlightColorEnum("color").notNull().default("yellow"),
    // Optional note attached to this highlight
    note: d.text(),
    // Context for disambiguating duplicate text matches (optional)
    contextPrefix: d.text(),
    contextSuffix: d.text(),
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
    articleId: d.uuid().notNull(),
    highlightId: d.uuid(),
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

// Relations
export const articlesRelations = relations(articles, ({ one, many }) => ({
  folder: one(folders, {
    fields: [articles.folderId],
    references: [folders.id],
  }),
  highlights: many(highlights),
  notes: many(notes),
}));

export const foldersRelations = relations(folders, ({ one, many }) => ({
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
  article: one(articles, {
    fields: [highlights.articleId],
    references: [articles.id],
  }),
  notes: many(notes),
}));

export const notesRelations = relations(notes, ({ one }) => ({
  article: one(articles, {
    fields: [notes.articleId],
    references: [articles.id],
  }),
  highlight: one(highlights, {
    fields: [notes.highlightId],
    references: [highlights.id],
  }),
}));

// Auth tables (Better Auth)
export {
  user,
  session,
  account,
  verification,
  userRelations,
  sessionRelations,
  accountRelations,
};
