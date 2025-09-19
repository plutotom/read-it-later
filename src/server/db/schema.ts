import { relations, sql } from "drizzle-orm";
import { index, primaryKey, pgTableCreator } from "drizzle-orm/pg-core";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `jess-app_${name}`);

export const users = createTable("user", (d) => ({
  id: d
    .text()
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: d.text(),
  email: d.text().notNull(),
  emailVerified: d.timestamp().default(sql`now()`),
  image: d.text(),
  // role: 'candidate' | 'company' | 'admin'
  role: d
    .text()
    .$type<"candidate" | "company" | "admin">()
    .notNull()
    .default("candidate"),
}));

export const sessions = createTable(
  "session",
  (d) => ({
    sessionToken: d.text().notNull().primaryKey(),
    userId: d
      .text()
      .notNull()
      .references(() => users.id),
    expires: d.timestamp().notNull(),
  }),
  (t) => [index("session_userId_idx").on(t.userId)],
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accounts = createTable(
  "account",
  (d) => ({
    userId: d
      .text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: d.text().notNull(),
    provider: d.text().notNull(),
    providerAccountId: d.text().notNull(),
    refresh_token: d.text(),
    access_token: d.text(),
    expires_at: d.integer(),
    token_type: d.text(),
    scope: d.text(),
    id_token: d.text(),
    session_state: d.text(),
  }),
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const verificationTokens = createTable(
  "verification_token",
  (d) => ({
    identifier: d.text().notNull(),
    token: d.text().notNull(),
    expires: d.timestamp().notNull(),
  }),
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const profiles = createTable("profile", (d) => ({
  id: d
    .text()
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: d
    .text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  bio: d.text(),
  location: d.text(),
  website: d.text(),
  linkedin: d.text(),
  github: d.text(),
  twitter: d.text(),
  phone: d.text(),
  resumeUrl: d.text(),
  skills: d.text().array(),
  experience: d.json(),
  education: d.json(),
  createdAt: d
    .timestamp()
    .default(sql`now()`)
    .notNull(),
  updatedAt: d
    .timestamp()
    .default(sql`now()`)
    .notNull(),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, { fields: [profiles.userId], references: [users.id] }),
}));
