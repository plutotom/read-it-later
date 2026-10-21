import { audioReport } from "./reports";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "~/server/db/schema";
import {
  beginAttempt,
  checkpointUsage,
  claimJob,
  finishAttempt,
  finishJob,
  recordReplay,
} from "./ledger";
import { prepareSpeech } from "./metering";
import { reserveListeningUsageInTransaction } from "../listening/quota";

const url = process.env.LISTENING_TEST_DATABASE_URL;
describe.skipIf(!url)(
  "durable audio accounting against isolated Postgres",
  () => {
    const name = "audio_ledger_" + randomUUID().replaceAll("-", "");
    const user = "synthetic-ledger",
      article = randomUUID();
    let connection: postgres.Sql,
      database: ReturnType<typeof drizzle<typeof schema>>;
    beforeAll(async () => {
      if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
        throw new Error("Isolated local DB required");
      connection = postgres(url, {
        max: 8,
        connection: { search_path: name },
        onnotice: () => undefined,
      });
      await connection.unsafe(`create schema "${name}"`);
      await connection.unsafe(
        `create table "read-it-later_user" (id text primary key);create table "read-it-later_article" (id uuid primary key);create table "read-it-later_tts_usage" (id text primary key,"userId" text,"billingPeriod" text,"charactersUsed" integer,"rawCharactersUsed" integer,"createdAt" timestamp not null default now(),"updatedAt" timestamp not null default now(),unique("userId","billingPeriod"));`,
      );
      await connection`insert into "read-it-later_user" values (${user})`;
      await connection`insert into "read-it-later_article" values (${article})`;
      for (const statement of readFileSync(
        "drizzle/0013_web_listening_usage.sql",
        "utf8",
      ).split("--> statement-breakpoint"))
        await connection.unsafe(statement);
      await connection`insert into "read-it-later_tts_usage" (id,"userId","billingPeriod","charactersUsed","rawCharactersUsed") values ('historical',${user}, '2026-09', 800, 100)`;
      await connection`insert into "read-it-later_listening_usage" values (${user}, 'month:2026-09', 100, 2), (${user}, 'minute:2026-09-21T10:00', 100, 2)`;
      for (const statement of readFileSync(
        "drizzle/0014_audio_usage.sql",
        "utf8",
      ).split("--> statement-breakpoint"))
        await connection.unsafe(statement);
      database = drizzle(connection, { schema });
    });
    afterAll(async () => {
      if (connection) {
        await connection.unsafe(`drop schema "${name}" cascade`);
        await connection.end();
      }
    });
    const input = (id: string) => ({
      id,
      userId: user,
      articleId: article,
      path: "stream" as const,
    });
    it("preserves old allowance counts without counting minute rows twice or inventing costs", async () => {
      const history = await database.select().from(schema.audioHistory);
      expect(
        history
          .map((r) => ({
            source: r.source,
            admitted: r.admittedUnits,
            raw: r.rawUnits,
          }))
          .sort((a, b) => a.source.localeCompare(b.source)),
      ).toEqual([
        { source: "legacy_weighted", admitted: 800, raw: 100 },
        { source: "stream_admitted", admitted: 100, raw: 100 },
      ]);
      expect(await database.select().from(schema.audioAttempts)).toHaveLength(
        0,
      );
    });
    it("admits one concurrent job and quota reservation atomically", async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          claimJob(
            { ...input("concurrent"), allowanceUnits: 10 },
            (tx) => reserveListeningUsageInTransaction(tx, user, 10),
            database,
          ),
        ),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      const quota = await database.select().from(schema.listeningUsage);
      expect(quota).toHaveLength(4);
      expect(
        quota
          .filter((r) => !r.window.includes("2026-09"))
          .every((r) => r.characters === 10 && r.requests === 1),
      ).toBe(true);
    });
    it("rolls back job creation when quota admission fails", async () => {
      await expect(
        claimJob(
          input("rejected"),
          (tx) => reserveListeningUsageInTransaction(tx, user, 100_000_000),
          database,
        ),
      ).rejects.toThrow("limit");
      expect(
        await database
          .select()
          .from(schema.audioJobs)
          .where(eq(schema.audioJobs.id, "rejected")),
      ).toHaveLength(0);
    });
    it("retains reported zero and idempotent settlement, and freezes the rate snapshot", async () => {
      const fence = await claimJob(
        input("settled"),
        async () => undefined,
        database,
      );
      const id = await beginAttempt(
        "settled",
        user,
        fence!,
        prepareSpeech("Hello", "google", "chirp3-hd", "voice"),
        database,
      );
      await checkpointUsage(id, 0, database);
      await checkpointUsage(id, 0, database);
      await finishAttempt(id, true, 48000, 1, database);
      await finishAttempt(id, false, 0, undefined, database);
      const [attempt] = await database
        .select()
        .from(schema.audioAttempts)
        .where(eq(schema.audioAttempts.id, id));
      expect(attempt).toMatchObject({
        state: "complete",
        reportedUnits: 0,
        estimatedUsd: "0.000000000000000",
        usdPerMillion: "30.000000000",
        measurement: "provider_reported",
      });
      const events = await database
        .select()
        .from(schema.audioEvents)
        .where(eq(schema.audioEvents.attemptId, id));
      expect(events.map((e) => e.kind).sort()).toEqual([
        "complete",
        "dispatch",
        "provider_usage",
      ]);
      await finishJob("settled", fence!, "complete", "stored", database);
      await recordReplay("settled", "replay-1", database);
      await recordReplay("settled", "replay-1", database);
      expect(
        await database
          .select()
          .from(schema.audioEvents)
          .where(eq(schema.audioEvents.kind, "cached_delivery")),
      ).toHaveLength(1);
    });
    it("settles only proven undispatched units atomically and never refunds twice", async () => {
      const now = new Date("2027-01-02T10:00:00Z");
      const fence = await claimJob(
        {
          ...input("partial-reservation"),
          allowanceUnits: 100,
          admittedAt: now,
        },
        (tx) => reserveListeningUsageInTransaction(tx, user, 100, now),
        database,
      );
      await beginAttempt(
        "partial-reservation",
        user,
        fence!,
        prepareSpeech("Paid part", "google", "chirp3-hd", "voice"),
        database,
        { units: 40, raw: 40 },
      );
      await finishJob(
        "partial-reservation",
        fence!,
        "unknown",
        "failed",
        database,
      );
      await finishJob(
        "partial-reservation",
        fence!,
        "unknown",
        "failed",
        database,
      );
      const rows = await database
        .select()
        .from(schema.listeningUsage)
        .where(eq(schema.listeningUsage.window, "month:2027-01"));
      expect(rows[0]?.characters).toBe(40);
      const [reservation] = await database
        .select()
        .from(schema.audioReservations)
        .where(eq(schema.audioReservations.id, fence!));
      expect(reservation).toMatchObject({
        reservedUnits: 100,
        dispatchedUnits: 40,
        settled: true,
      });
      const second = await claimJob(
        { ...input("pre-dispatch"), allowanceUnits: 100, admittedAt: now },
        (tx) => reserveListeningUsageInTransaction(tx, user, 100, now),
        database,
      );
      await finishJob(
        "pre-dispatch",
        second!,
        "not_dispatched",
        "failed",
        database,
      );
      expect(
        (
          await database
            .select()
            .from(schema.listeningUsage)
            .where(eq(schema.listeningUsage.window, "month:2027-01"))
        )[0]?.characters,
      ).toBe(40);
    });
    it("blocks silent retry after crash/expiry and rejects stale fenced workers", async () => {
      const fence = await claimJob(
        input("ambiguous"),
        async () => undefined,
        database,
      );
      const id = await beginAttempt(
        "ambiguous",
        user,
        fence!,
        prepareSpeech("Hello", "google", "chirp3-hd", "voice"),
        database,
      );
      await database
        .update(schema.audioJobs)
        .set({ leaseUntil: new Date(0) })
        .where(eq(schema.audioJobs.id, "ambiguous"));
      await expect(
        claimJob(input("ambiguous"), async () => undefined, database),
      ).rejects.toThrow("explicitly regenerate");
      const next = await claimJob(
        { ...input("ambiguous"), regenerate: true },
        async () => undefined,
        database,
      );
      await expect(
        beginAttempt(
          "ambiguous",
          user,
          fence!,
          prepareSpeech("Hi", "google", "chirp3-hd", "voice"),
          database,
        ),
      ).rejects.toThrow("lease lost");
      await finishAttempt(id, false, 24000, undefined, database);
      await finishJob("ambiguous", fence!, "complete", "stored", database);
      const [job] = await database
        .select()
        .from(schema.audioJobs)
        .where(eq(schema.audioJobs.id, "ambiguous"));
      expect(job?.fence).toBe(next);
      expect(job?.state).toBe("generating");
    });
    it("runs own-account aggregates on the real schema and excludes other accounts/articles", async () => {
      const report = await audioReport(
        "unrelated-user",
        new Date().toISOString().slice(0, 7),
        false,
        article,
        database,
      );
      expect(report.summary.attempts).toBe(0);
      expect(report.cachedDeliveries).toBe(0);
      expect(report.recent).toEqual([]);
      expect(report.history).toEqual([]);
      const own = await audioReport(
        user,
        "2026-09",
        false,
        undefined,
        database,
      );
      expect(own.allowances.stream.used).toBe(100);
      expect(own.allowances.legacy.used).toBe(800);
      expect(own.allowanceDifferences).toEqual({ stream: "0", legacy: "0" });
    });
  },
);
