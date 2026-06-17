/**
 * Grant existing API keys the `ril:read` scope so they keep working against
 * the public REST API (/api/v1) read endpoints. Pre-existing keys only carried
 * `para:read`. Idempotent — safe to run multiple times.
 *
 * Usage: node scripts/backfill-api-key-scopes.mjs
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
    const updated = await sql`
      UPDATE "read-it-later_api_key"
      SET scopes = array_append(scopes, 'ril:read')
      WHERE NOT ('ril:read' = ANY(scopes))
      RETURNING id
    `;
    console.log(`Backfilled ril:read on ${updated.length} API key(s).`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
