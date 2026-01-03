import { relations } from "drizzle-orm";
import {
  pgTableCreator,
  pgEnum,
} from "drizzle-orm/pg-core";
// import { createTable } from "~/server/db/schema";
/**
 * Multi-project schema feature of Drizzle ORM
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator(
  (name: string) => `read-it-later_${name}`,
);
export const user = createTable("user", (d) => ({
  id: d.text().primaryKey(),
  name: d.text().notNull(),
  email: d.text().notNull().unique(),
  emailVerified: d.boolean().default(false).notNull(),
  image: d.text(),
  createdAt: d.timestamp().defaultNow().notNull(),
  updatedAt: d
    .timestamp()
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
    deletedAt: d.timestamp(),
}));

export const session = createTable("session", (d) => ({
  id: d.text().primaryKey(),
  expiresAt: d.timestamp().notNull(),
  token: d.text().notNull().unique(),
  createdAt: d.timestamp().defaultNow().notNull(),
  updatedAt: d
    .timestamp()
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  ipAddress: d.text(),
  userAgent: d.text(),
  userId: d
    .text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
}));

export const account = createTable("account", (d) => ({
  id: d.text().primaryKey(),
  accountId: d.text().notNull(),
  providerId: d.text().notNull(),
  userId: d
    .text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: d.text(),
  refreshToken: d.text(),
  idToken: d.text(),
  accessTokenExpiresAt: d.timestamp(),
  refreshTokenExpiresAt: d.timestamp(),
  scope: d.text(),
  password: d.text(),
  createdAt: d.timestamp().defaultNow().notNull(),
  updatedAt: d
    .timestamp()
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}));

export const verification = createTable("verification", (d) => ({
  id: d.text().primaryKey(),
  identifier: d.text().notNull(),
  value: d.text().notNull(),
  expiresAt: d.timestamp().notNull(),
  createdAt: d.timestamp().defaultNow().notNull(),
  updatedAt: d
    .timestamp()
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}));

// Theme enum for user preferences
export const themeEnum = pgEnum("theme", ["light", "dark"]);

// User preferences table
export const userPreferences = createTable("user_preferences", (d) => ({
  id: d.text().primaryKey(),
  userId: d
    .text()
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  theme: themeEnum("theme").default("light").notNull(),
  settings: d.jsonb().default({}).$type<Record<string, unknown>>(),
  createdAt: d.timestamp().defaultNow().notNull(),
  updatedAt: d
    .timestamp()
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}));

// TTS usage tracking table - tracks monthly character consumption
export const ttsUsage = createTable("tts_usage", (d) => ({
  id: d.text().primaryKey(),
  // Year-month in format "YYYY-MM" for easy querying
  billingPeriod: d.varchar({ length: 7 }).notNull(),
  // Total characters used in this billing period
  charactersUsed: d.integer().notNull().default(0),
  // Voice type used (for different free tier limits)
  voiceType: d.varchar({ length: 50 }).notNull().default("standard"),
  createdAt: d.timestamp().defaultNow().notNull(),
  updatedAt: d
    .timestamp()
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}));

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  preferences: one(userPreferences),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(user, {
    fields: [userPreferences.userId],
    references: [user.id],
  }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
