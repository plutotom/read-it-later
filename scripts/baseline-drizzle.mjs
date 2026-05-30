/**
 * Mark migrations 0000–0008 as applied without running their SQL.
 * Use when the database schema already exists (e.g. from db:push) but
 * drizzle.__drizzle_migrations is empty or incomplete.
 *
 * Usage: pnpm db:baseline && pnpm db:migrate
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const migrationsFolder = path.join(process.cwd(), "drizzle");
const journalPath = path.join(migrationsFolder, "meta/_journal.json");

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    throw new Error("DATABASE_URL is not set and .env was not found");
  }

  const env = fs.readFileSync(envPath, "utf8");
  const match = env.match(/^DATABASE_URL=(.+)$/m);
  if (!match?.[1]) {
    throw new Error("DATABASE_URL is not set in .env");
  }

  return match[1].trim().replace(/^["']|["']$/g, "");
}

function readMigrationEntries() {
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  return journal.entries.map((entry) => {
    const filePath = path.join(migrationsFolder, `${entry.tag}.sql`);
    const query = fs.readFileSync(filePath, "utf8");
    return {
      tag: entry.tag,
      when: entry.when,
      hash: crypto.createHash("sha256").update(query).digest("hex"),
    };
  });
}

const baselineThroughTag = process.argv[2] ?? "0008_groovy_roulette";

async function main() {
  const entries = readMigrationEntries();
  const baselineIndex = entries.findIndex((e) => e.tag === baselineThroughTag);
  if (baselineIndex === -1) {
    throw new Error(`Unknown migration tag: ${baselineThroughTag}`);
  }

  const toBaseline = entries.slice(0, baselineIndex + 1);
  const sql = postgres(loadDatabaseUrl());

  try {
    await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
    await sql`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `;

    const existing = await sql`
      SELECT hash, created_at
      FROM drizzle.__drizzle_migrations
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const lastWhen = existing[0]?.created_at
      ? Number(existing[0].created_at)
      : 0;
    const targetWhen = toBaseline[toBaseline.length - 1].when;

    if (lastWhen >= targetWhen) {
      console.log(
        `Already baselined through ${baselineThroughTag} (created_at=${lastWhen}).`,
      );
      return;
    }

    for (const entry of toBaseline) {
      if (entry.when <= lastWhen) continue;

      const alreadyApplied = await sql`
        SELECT 1
        FROM drizzle.__drizzle_migrations
        WHERE hash = ${entry.hash}
        LIMIT 1
      `;
      if (alreadyApplied.length > 0) continue;

      await sql`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${entry.hash}, ${entry.when})
      `;
      console.log(`Marked applied: ${entry.tag}`);
    }

    console.log(`Baseline complete through ${baselineThroughTag}.`);
    console.log("Next: pnpm db:migrate");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
