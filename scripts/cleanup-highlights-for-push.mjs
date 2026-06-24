/**
 * Prepares the highlight table for schema push:
 * 1. Migrates legacy `note` column values into read-it-later_note rows
 * 2. Deletes highlights whose articleId no longer exists (blocks FK creation)
 *
 * Usage: node scripts/cleanup-highlights-for-push.mjs
 */
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    throw new Error("DATABASE_URL is not set and .env was not found");
  }
  const env = fs.readFileSync(envPath, "utf8");
  const match = env.match(/^DATABASE_URL=(.+)$/m);
  if (!match?.[1]) throw new Error("DATABASE_URL is not set in .env");
  return match[1].trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const sql = postgres(loadDatabaseUrl());

  try {
    const migrated = await sql`
      INSERT INTO "read-it-later_note" ("userId", "articleId", "highlightId", content)
      SELECT h."userId", h."articleId", h.id, h.note
      FROM "read-it-later_highlight" h
      INNER JOIN "read-it-later_article" a ON a.id = h."articleId"
      WHERE h.note IS NOT NULL
        AND TRIM(h.note) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM "read-it-later_note" n WHERE n."highlightId" = h.id
        )
      RETURNING id, "highlightId"
    `;
    console.log(`Migrated ${migrated.length} highlight note(s) to read-it-later_note.`);

    const deleted = await sql`
      DELETE FROM "read-it-later_highlight" h
      WHERE NOT EXISTS (
        SELECT 1 FROM "read-it-later_article" a WHERE a.id = h."articleId"
      )
      RETURNING id, "articleId"
    `;
    console.log(`Deleted ${deleted.length} orphaned highlight(s).`);
    for (const row of deleted) {
      console.log(`  - ${row.id} (missing article ${row.articleId})`);
    }

    const remainingOrphans = await sql`
      SELECT COUNT(*)::int AS count
      FROM "read-it-later_highlight" h
      LEFT JOIN "read-it-later_article" a ON a.id = h."articleId"
      WHERE a.id IS NULL
    `;
    if (remainingOrphans[0].count > 0) {
      throw new Error(`${remainingOrphans[0].count} orphaned highlight(s) remain`);
    }

    console.log("Cleanup complete — safe to run pnpm db:push.");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
