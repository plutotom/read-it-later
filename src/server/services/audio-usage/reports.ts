import { reconcileBilling } from "./reconciliation";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "~/server/db";
import {
  audioAttempts as attempts,
  audioJobs as jobs,
  audioCacheDeliveries as deliveries,
  audioHistory,
  audioAccountingCoverage,
  audioBilling,
  audioReservations,
  listeningUsage,
  ttsUsage,
} from "~/server/db/schema";
import { env } from "~/env";
import { TTS_FREE_TIER_LIMIT } from "~/lib/tts-voices";

export function isAudioAdmin(userId: string) {
  return (env.AUDIO_USAGE_ADMIN_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}
export async function audioReport(
  userId: string,
  period: string,
  all: boolean,
  articleId?: string,
  database = db,
) {
  if (all && !isAudioAdmin(userId)) throw new Error("Forbidden audio report");
  const start = new Date(period + "-01T00:00:00.000Z");
  const end = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
  );
  const filter = and(
    gte(attempts.startedAt, start),
    lt(attempts.startedAt, end),
    all ? undefined : eq(attempts.userId, userId),
    articleId ? eq(jobs.articleId, articleId) : undefined,
  );
  const totals = {
    attempts: sql<number>`count(*)::int`,
    requestedUnits: sql<string>`coalesce(sum(${attempts.requestedUnits}),0)::text`,
    reportedAttempts: sql<number>`count(*) filter (where ${attempts.reportedUnits} is not null)::int`,
    reportedUnits: sql<string>`coalesce(sum(${attempts.reportedUnits}),0)::text`,
    estimatedUsd: sql<string>`coalesce(sum(${attempts.estimatedUsd}),0)::text`,
    unknownPrice: sql<number>`count(*) filter (where ${attempts.estimatedUsd} is null)::int`,
    uncertain: sql<number>`count(*) filter (where ${attempts.state} <> 'complete')::int`,
    pending: sql<number>`count(*) filter (where ${attempts.state} = 'dispatched' and ${jobs.leaseUntil} > now() and ${jobs.state} = 'generating')::int`,
    audioBytes: sql<string>`coalesce(sum(${attempts.audioBytes}),0)::text`,
    generatedSeconds: sql<number>`coalesce(sum(${attempts.durationSeconds}),0)::real`,
  };
  const [summary] = await database
    .select(totals)
    .from(attempts)
    .innerJoin(jobs, eq(attempts.jobId, jobs.id))
    .where(filter);
  const breakdown = await database
    .select({
      provider: attempts.provider,
      model: attempts.model,
      voice: attempts.voice,
      unit: attempts.unit,
      environment: attempts.environment,
      providerAccount: attempts.providerAccount,
      ...totals,
    })
    .from(attempts)
    .innerJoin(jobs, eq(attempts.jobId, jobs.id))
    .where(filter)
    .groupBy(
      attempts.provider,
      attempts.model,
      attempts.voice,
      attempts.unit,
      attempts.environment,
      attempts.providerAccount,
    );
  const recent = await database
    .select({
      id: attempts.id,
      articleId: jobs.articleId,
      provider: attempts.provider,
      voice: attempts.voice,
      requestedUnits: attempts.requestedUnits,
      reportedUnits: attempts.reportedUnits,
      measurement: attempts.measurement,
      state: attempts.state,
      estimatedUsd: attempts.estimatedUsd,
      cacheState: jobs.cacheState,
      startedAt: attempts.startedAt,
    })
    .from(attempts)
    .innerJoin(jobs, eq(attempts.jobId, jobs.id))
    .where(filter)
    .orderBy(sql`${attempts.startedAt} desc`)
    .limit(30);
  const [replays] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(deliveries)
    .where(
      and(
        gte(deliveries.createdAt, start),
        lt(deliveries.createdAt, end),
        all ? undefined : eq(deliveries.userId, userId),
        articleId ? eq(deliveries.articleId, articleId) : undefined,
      ),
    );
  const [coverage] = await database
    .select()
    .from(audioAccountingCoverage)
    .where(eq(audioAccountingCoverage.id, "detailed-v1"));
  const history = await database
    .select({
      source: audioHistory.source,
      admittedUnits: sql<string>`sum(${audioHistory.admittedUnits})::text`,
      rawUnits: sql<string>`sum(${audioHistory.rawUnits})::text`,
    })
    .from(audioHistory)
    .where(
      and(
        eq(audioHistory.period, period),
        all ? undefined : eq(audioHistory.userId, userId),
      ),
    )
    .groupBy(audioHistory.source);
  const [stream] = await database
    .select()
    .from(listeningUsage)
    .where(
      and(
        eq(listeningUsage.userId, userId),
        eq(listeningUsage.window, "month:" + period),
      ),
    );
  const [legacy] = await database
    .select()
    .from(ttsUsage)
    .where(
      and(eq(ttsUsage.userId, userId), eq(ttsUsage.billingPeriod, period)),
    );
  const billing = all
    ? await database
        // Reconcile complete financial aggregates, never a presentation row limit.
        .select({
          provider: audioBilling.provider,
          providerAccount: audioBilling.providerAccount,
          environment: audioBilling.environment,
          model: audioBilling.model,
          currency: audioBilling.currency,
          gross: sql<string>`sum(${audioBilling.gross})::text`,
          credits: sql<string>`sum(${audioBilling.credits})::text`,
          net: sql<string>`sum(${audioBilling.net})::text`,
        })
        .from(audioBilling)
        .where(eq(audioBilling.period, period))
        .groupBy(
          audioBilling.provider,
          audioBilling.providerAccount,
          audioBilling.environment,
          audioBilling.model,
          audioBilling.currency,
        )
    : [];
  const pending = await database
    .select({
      path: jobs.path,
      units: sql<number>`coalesce(sum(${jobs.allowanceUnits}),0)::int`,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.userId, userId),
        eq(jobs.allowancePeriod, period),
        eq(jobs.state, "generating"),
        gte(jobs.leaseUntil, new Date()),
      ),
    )
    .groupBy(jobs.path);
  const reservationTotals = await database
    .select({
      path: audioReservations.path,
      units: sql<string>`coalesce(sum(case when ${audioReservations.settled} then ${audioReservations.dispatchedUnits} else ${audioReservations.reservedUnits} end),0)::text`,
    })
    .from(audioReservations)
    .where(
      and(
        eq(audioReservations.period, period),
        all ? undefined : eq(audioReservations.userId, userId),
      ),
    )
    .groupBy(audioReservations.path);
  const [streamTotal] = await database
    .select({
      units: sql<string>`coalesce(sum(${listeningUsage.characters}),0)::text`,
    })
    .from(listeningUsage)
    .where(
      and(
        eq(listeningUsage.window, "month:" + period),
        all ? undefined : eq(listeningUsage.userId, userId),
      ),
    );
  const [legacyTotal] = await database
    .select({
      units: sql<string>`coalesce(sum(${ttsUsage.charactersUsed}),0)::text`,
    })
    .from(ttsUsage)
    .where(
      and(
        eq(ttsUsage.billingPeriod, period),
        all ? undefined : eq(ttsUsage.userId, userId),
      ),
    );
  const allowanceDifferences = {
    stream: (
      BigInt(streamTotal?.units ?? "0") -
      BigInt(
        history.find((row) => row.source === "stream_admitted")
          ?.admittedUnits ?? "0",
      ) -
      BigInt(
        reservationTotals.find((row) => row.path === "stream")?.units ?? "0",
      )
    ).toString(),
    legacy: (
      BigInt(legacyTotal?.units ?? "0") -
      BigInt(
        history.find((row) => row.source === "legacy_weighted")
          ?.admittedUnits ?? "0",
      ) -
      BigInt(
        reservationTotals.find((row) => row.path === "legacy")?.units ?? "0",
      )
    ).toString(),
  };
  return {
    period,
    allowanceDifferences,
    resetDate: end.toISOString(),
    isAdmin: isAudioAdmin(userId),
    scope: all ? "all" : "own",
    summary: summary!,
    breakdown,
    recent,
    cachedDeliveries: replays?.count ?? 0,
    coverageSince: coverage?.startedAt?.toISOString() ?? null,
    history,
    billing,
    reconciliation: all ? reconcileBilling(billing, breakdown) : [],
    allowances: {
      stream: {
        used: stream?.characters ?? 0,
        reserved: pending.find((row) => row.path === "stream")?.units ?? 0,
        limit: env.WEB_SPEECH_MONTHLY_CHARACTER_LIMIT ?? 500_000,
      },
      legacy: {
        used: legacy?.charactersUsed ?? 0,
        reserved: pending.find((row) => row.path === "legacy")?.units ?? 0,
        raw: legacy?.rawCharactersUsed ?? 0,
        limit: TTS_FREE_TIER_LIMIT,
      },
    },
  };
}
