import { relations, sql } from "drizzle-orm";
import { index, primaryKey, sqliteTableCreator } from "drizzle-orm/sqlite-core";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = sqliteTableCreator((name) => `jess-app_${name}`);

export const users = createTable("user", (d) => ({
  id: d
    .text({ length: 255 })
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: d.text({ length: 255 }),
  email: d.text({ length: 255 }).notNull(),
  emailVerified: d.integer({ mode: "timestamp" }).default(sql`(unixepoch())`),
  image: d.text({ length: 255 }),
  // role: 'candidate' | 'company' | 'admin'
  role: d
    .text({ length: 20 })
    .$type<"candidate" | "company" | "admin">()
    .notNull()
    .default("candidate"),
}));

export const sessions = createTable(
  "session",
  (d) => ({
    sessionToken: d.text({ length: 255 }).notNull().primaryKey(),
    userId: d
      .text({ length: 255 })
      .notNull()
      .references(() => users.id),
    expires: d.integer({ mode: "timestamp" }).notNull(),
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
      .text({ length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: d.text({ length: 255 }).notNull(),
    provider: d.text({ length: 255 }).notNull(),
    providerAccountId: d.text({ length: 255 }).notNull(),
    refresh_token: d.text({ length: 255 }),
    access_token: d.text({ length: 255 }),
    expires_at: d.integer(),
    token_type: d.text({ length: 255 }),
    scope: d.text({ length: 255 }),
    id_token: d.text({ length: 255 }),
    session_state: d.text({ length: 255 }),
  }),
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const verificationTokens = createTable(
  "verification_token",
  (d) => ({
    identifier: d.text({ length: 255 }).notNull(),
    token: d.text({ length: 255 }).notNull(),
    expires: d.integer({ mode: "timestamp" }).notNull(),
  }),
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);
