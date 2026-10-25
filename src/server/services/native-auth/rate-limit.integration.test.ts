import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";

const testURL = process.env.NATIVE_AUTH_TEST_DATABASE_URL;
vi.mock("~/env", () => ({
  env: { AUTH_SECRET: "native-auth-test-only-secret-at-least-32-characters" },
}));
vi.mock("~/server/db", async () => {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const schema = await import("~/schemas/auth");
  const client = postgres(
    process.env.NATIVE_AUTH_TEST_DATABASE_URL ??
      "postgres://localhost:55439/auth_test",
    {
      max: 4,
      idle_timeout: 1,
      connection: { search_path: "native_auth_tests" },
    },
  );
  return { db: drizzle(client, { schema }) };
});
import { db } from "~/server/db";
import { allowAuthAttempt } from "./rate-limit";

describe.skipIf(!testURL)("native auth shared Postgres admission", () => {
  let setup: ReturnType<typeof postgres>;
  beforeAll(async () => {
    if (
      !testURL ||
      !["localhost", "127.0.0.1"].includes(new URL(testURL).hostname)
    )
      throw new Error("Use an isolated local test database");
    setup = postgres(testURL, { max: 1 });
    await setup`create schema if not exists native_auth_tests`;
  });
  afterAll(async () => {
    if (setup) {
      await setup`drop schema native_auth_tests cascade`;
      await setup.end();
    }
  });
  it("atomically admits at most five attempts across concurrent requests", async () => {
    await db.execute(
      sql.raw(`CREATE TABLE IF NOT EXISTS "read-it-later_verification" (
      id text primary key, identifier text not null, value text not null,
      "expiresAt" timestamp not null, "createdAt" timestamp default now() not null,
      "updatedAt" timestamp default now() not null
    )`),
    );
    const key = `fixture-${randomUUID()}`;
    const admitted = await Promise.all(
      Array.from({ length: 15 }, () => allowAuthAttempt(key, 5)),
    );
    expect(admitted.filter(Boolean)).toHaveLength(5);
  });
});
