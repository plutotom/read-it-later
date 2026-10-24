import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.LISTENING_TEST_DATABASE_URL;
vi.mock("~/env", () => ({ env: { WEB_SPEECH_MONTHLY_CHARACTER_LIMIT: 1000 } }));
vi.mock("~/server/db", async () => {
  const sql = postgres(
    process.env.LISTENING_TEST_DATABASE_URL ??
      "postgresql://127.0.0.1:5419/test",
    { max: 10 },
  );
  return { db: drizzle(sql), testSQL: sql };
});
import { reserveListeningUsage } from "./quota";

describe.skipIf(!url)("listening admission against Postgres", () => {
  const userId = "listening-quota-" + randomUUID();
  let connection: postgres.Sql;
  const now = new Date("2026-10-21T12:00:00Z");
  beforeAll(async () => {
    if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
      throw new Error(
        "Listening integration tests require an isolated local database.",
      );
    // Only runs against an explicitly supplied, isolated test database.
    const dbModule = (await import("~/server/db")) as unknown as {
      testSQL: postgres.Sql;
    };
    connection = dbModule.testSQL;
    await connection.unsafe(
      'CREATE TABLE IF NOT EXISTS "read-it-later_user" (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE)',
    );
    const present =
      await connection`select to_regclass('public."read-it-later_listening_usage"') as name`;
    if (!present[0]?.name)
      await connection.unsafe(
        await readFile("drizzle/0013_web_listening_usage.sql", "utf8"),
      );
    await connection`insert into "read-it-later_user" (id,name,email) values (${userId},'Synthetic quota test',${userId + "@example.invalid"})`;
  });
  afterAll(async () => {
    if (connection) {
      await connection`delete from "read-it-later_user" where id = ${userId}`;
      await connection.end();
    }
  });
  it("enforces the monthly budget atomically across concurrent requests", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 40 }, () => reserveListeningUsage(userId, 40, now)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(25);
    const rows = await connection<
      { characters: number; requests: number }[]
    >`select "window", characters, requests from "read-it-later_listening_usage" where "userId" = ${userId} order by "window"`;
    expect(
      rows.map((r) => ({ characters: r.characters, requests: r.requests })),
    ).toEqual([
      { characters: 1000, requests: 25 },
      { characters: 1000, requests: 25 },
    ]);
    // A new month has an independent budget; a request beyond the limit cannot create a counter.
    await expect(
      reserveListeningUsage(userId, 1001, new Date("2026-11-01T00:00:00Z")),
    ).rejects.toThrow("limit");
    const absent =
      await connection`select * from "read-it-later_listening_usage" where "userId" = ${userId} and "window" like '%2026-11%'`;
    expect(absent).toHaveLength(0);
  });
  it("rolls back monthly reservations when the per-minute request limit is reached", async () => {
    const time = new Date("2026-11-20T12:00:00Z");
    const results = await Promise.allSettled(
      Array.from({ length: 60 }, () => reserveListeningUsage(userId, 1, time)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(40);
    const rows = await connection<
      { characters: number; requests: number }[]
    >`select characters, requests from "read-it-later_listening_usage" where "userId" = ${userId} and "window" like '%2026-11%'`;
    expect(
      rows.map((r) => ({ characters: r.characters, requests: r.requests })),
    ).toEqual([
      { characters: 40, requests: 40 },
      { characters: 40, requests: 40 },
    ]);
  });
});
