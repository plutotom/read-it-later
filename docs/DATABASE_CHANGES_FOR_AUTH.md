# Database Changes Required for Authentication

This document outlines the database schema changes needed to bind application data to authenticated users after integrating Better Auth with Discord OAuth.

## Better Auth Tables

Better Auth will automatically create the following tables when you run migrations:
- `user` - Stores user accounts
- `session` - Stores user sessions
- `account` - Stores OAuth account links (Discord in this case)
- `verification` - Stores email verification tokens (if email auth is enabled later)

These tables are managed by Better Auth and should not be modified directly.

## Required Schema Changes

To bind application data to users, you need to add `userId` foreign key columns to the following tables:

### 1. Articles Table

**Current State:**
- The `articles` table does not have a `userId` column
- All articles are currently global/shared

**Required Change:**
```typescript
// In src/server/db/schema.ts
export const articles = createTable(
  "article",
  (d) => ({
    // ... existing fields ...
    userId: d.uuid().notNull(), // Add this field
    // ... rest of fields ...
  }),
  // ... indexes ...
);
```

**Migration Steps:**
1. Add `userId` column to `articles` table
2. For existing articles, you'll need to decide:
   - Assign them to a default/admin user
   - Delete them
   - Leave them orphaned (not recommended)
3. Add foreign key constraint: `userId` references `user.id`
4. Add index on `userId` for query performance

### 2. Folders Table

**Current State:**
- The `folders` table already has a `userId` field (line 92 in schema.ts), but it's optional and commented as "For future multi-user support"

**Required Change:**
```typescript
// In src/server/db/schema.ts
export const folders = createTable(
  "folder",
  (d) => ({
    // ... existing fields ...
    userId: d.uuid().notNull(), // Change from optional to required
    // ... rest of fields ...
  }),
  // ... indexes ...
);
```

**Migration Steps:**
1. Make `userId` required (not null)
2. For existing folders, assign them to a default/admin user or delete them
3. Add foreign key constraint: `userId` references `user.id`
4. Update existing index on `userId` if needed

### 3. Highlights Table

**Current State:**
- The `highlights` table does not have a `userId` column
- Highlights are linked to articles via `articleId`

**Required Change:**
```typescript
// In src/server/db/schema.ts
export const highlights = createTable(
  "highlight",
  (d) => ({
    // ... existing fields ...
    userId: d.uuid().notNull(), // Add this field
    // ... rest of fields ...
  }),
  // ... indexes ...
);
```

**Migration Steps:**
1. Add `userId` column to `highlights` table
2. Populate `userId` from the related article's `userId` for existing highlights
3. Add foreign key constraint: `userId` references `user.id`
4. Add index on `userId` for query performance
5. Consider a composite index on `(userId, articleId)` for common queries

### 4. Notes Table

**Current State:**
- The `notes` table does not have a `userId` column
- Notes are linked to articles via `articleId`

**Required Change:**
```typescript
// In src/server/db/schema.ts
export const notes = createTable(
  "note",
  (d) => ({
    // ... existing fields ...
    userId: d.uuid().notNull(), // Add this field
    // ... rest of fields ...
  }),
  // ... indexes ...
);
```

**Migration Steps:**
1. Add `userId` column to `notes` table
2. Populate `userId` from the related article's `userId` for existing notes
3. Add foreign key constraint: `userId` references `user.id`
4. Add index on `userId` for query performance
5. Consider a composite index on `(userId, articleId)` for common queries

## Updated Relations

After adding `userId` fields, update the relations in the schema:

```typescript
// Add user relation to articles
export const articlesRelations = relations(articles, ({ one, many }) => ({
  user: one(users, {
    fields: [articles.userId],
    references: [users.id],
  }),
  folder: one(folders, {
    fields: [articles.folderId],
    references: [folders.id],
  }),
  highlights: many(highlights),
  notes: many(notes),
}));

// Add user relation to folders
export const foldersRelations = relations(folders, ({ one, many }) => ({
  user: one(users, {
    fields: [folders.userId],
    references: [users.id],
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

// Add user relation to highlights
export const highlightsRelations = relations(highlights, ({ one, many }) => ({
  user: one(users, {
    fields: [highlights.userId],
    references: [users.id],
  }),
  article: one(articles, {
    fields: [highlights.articleId],
    references: [articles.id],
  }),
  notes: many(notes),
}));

// Add user relation to notes
export const notesRelations = relations(notes, ({ one }) => ({
  user: one(users, {
    fields: [notes.userId],
    references: [users.id],
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
```

## tRPC Router Updates

After schema changes, update all tRPC routers to filter by `userId`:

### Example: Article Router

```typescript
// In src/server/api/routers/article.ts
export const articleRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.articles.findMany({
      where: and(
        eq(articles.userId, ctx.session.user.id),
        eq(articles.isArchived, false)
      ),
      orderBy: (articles, { desc }) => [desc(articles.createdAt)],
    });
  }),

  create: protectedProcedure
    .input(/* ... */)
    .mutation(async ({ ctx, input }) => {
      // ... extraction logic ...
      const [newArticle] = await ctx.db
        .insert(articles)
        .values({
          // ... other fields ...
          userId: ctx.session.user.id, // Add this
        })
        .returning();
      return newArticle;
    }),
});
```

**Key Changes:**
1. Change `publicProcedure` to `protectedProcedure` for all operations
2. Add `userId: ctx.session.user.id` to all insert operations
3. Add `eq(table.userId, ctx.session.user.id)` to all query filters
4. Ensure users can only access their own data

## Migration Strategy

### Option 1: Clean Slate (Recommended for Development)
1. Drop all existing data
2. Run Better Auth migrations to create auth tables
3. Update schema with `userId` fields
4. Run new migrations
5. Start fresh with authenticated users

### Option 2: Data Migration (For Production)
1. Run Better Auth migrations first
2. Create a migration script that:
   - Adds `userId` columns (nullable initially)
   - Assigns existing data to a default admin user (or creates one)
   - Makes `userId` columns non-nullable
   - Adds foreign key constraints
3. Update application code to use `protectedProcedure`
4. Test thoroughly before deploying

## Security Considerations

1. **Always use `protectedProcedure`** for operations that should be user-specific
2. **Never trust client-provided user IDs** - always use `ctx.session.user.id`
3. **Add database-level constraints** - foreign keys ensure data integrity
4. **Index `userId` columns** - essential for query performance
5. **Consider row-level security** - PostgreSQL RLS can add an extra layer of protection

## Next Steps

1. Review and approve these schema changes
2. Create Drizzle migration files
3. Update tRPC routers to use `protectedProcedure` and filter by `userId`
4. Update frontend components to handle authentication state
5. Test the complete authentication flow
6. Deploy migrations to production (with data migration if needed)

