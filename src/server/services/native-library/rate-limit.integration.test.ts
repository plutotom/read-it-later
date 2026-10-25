import type postgres from "postgres";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  schema: `native_library_rate_${Date.now()}_${Math.floor(Math.random() * 1e9)}`,
  connection: undefined as postgres.Sql | undefined,
}));
const testURL = process.env.NATIVE_LIBRARY_TEST_DATABASE_URL;
vi.mock("~/env", () => ({
  env: { AUTH_SECRET: "synthetic-native-library-rate-limit-secret-only" },
}));
vi.mock("~/server/db", async () => {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const url =
    process.env.NATIVE_LIBRARY_TEST_DATABASE_URL ??
    "postgres://postgres@127.0.0.1:55439/sync_test";
  // Validate before even constructing a connection so a failing fixture can
  // never run cleanup against a remote database.
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname))
    throw new Error("Use an explicit isolated local test database");
  fixture.connection = postgres(url, {
    max: 8,
    connection: { search_path: fixture.schema },
    onnotice: () => undefined,
  });
  return { db: drizzle(fixture.connection) };
});
vi.mock("~/server/auth", () => ({
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => ({
        user: {
          id:
            headers.get("authorization") === "Bearer synthetic-other"
              ? "synthetic-other-owner"
              : "synthetic-rate-owner",
        },
        session: { expiresAt: new Date(Date.now() + 60_000) },
      }),
    },
  },
}));
import {
  nativeLibraryRoute,
  NATIVE_LIBRARY_MUTATION_REQUESTS_PER_MINUTE,
} from "./http";

describe.skipIf(!testURL)("native library durable mutation admission", () => {
  beforeAll(async () => {
    if (
      !testURL ||
      !["127.0.0.1", "localhost", "[::1]"].includes(new URL(testURL).hostname)
    )
      throw new Error("Use an explicit isolated local test database");
    const connection = fixture.connection;
    if (!connection) throw new Error("Missing fixture connection");
    await connection.unsafe(`CREATE SCHEMA "${fixture.schema}"`);
    await connection.unsafe(`CREATE TABLE "read-it-later_verification" (
      id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL,
      "expiresAt" timestamp NOT NULL, "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    )`);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    if (fixture.connection) {
      await fixture.connection.unsafe(
        `DROP SCHEMA "${fixture.schema}" CASCADE`,
      );
      await fixture.connection.end();
    }
  });

  it("admits 120 concurrent owner requests, returns 429 beyond the limit, and resets next minute", async () => {
    const now = Math.floor(Date.now() / 60_000) * 60_000 + 1_000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const handle = vi.fn(async () => ({ applied: true }));
    const request = (token = "synthetic-owner") =>
      nativeLibraryRoute(
        new Request("https://example.invalid/api/native/library/mutations", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }),
        handle,
      );
    const responses = await Promise.all(
      Array.from(
        { length: NATIVE_LIBRARY_MUTATION_REQUESTS_PER_MINUTE + 5 },
        () => request(),
      ),
    );
    expect(
      responses.filter((response) => response.status === 200),
    ).toHaveLength(120);
    const rejected = responses.filter((response) => response.status !== 200);
    expect(rejected).toHaveLength(5);
    for (const response of rejected) {
      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({ code: "rate_limited" });
      expect(response.headers.get("retry-after")).toBe("60");
    }
    expect(handle).toHaveBeenCalledTimes(120);
    expect((await request("synthetic-other")).status).toBe(200);
    clock.mockReturnValue(now + 60_000);
    expect((await request()).status).toBe(200);
    expect(handle).toHaveBeenCalledTimes(122);
  });
});
