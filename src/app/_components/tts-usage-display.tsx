"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "~/trpc/react";
import { Progress } from "~/components/ui/progress";

const count = (value: number | string) => Number(value).toLocaleString();
const dollars = (value: string | null) =>
  value === null
    ? "Rate unavailable"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      }).format(Number(value));

/** Allowances are app policy; provider estimates are a separate, auditable measure. */
export function TTSUsageDisplay({ compact = false }: { compact?: boolean }) {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [scope, setScope] = useState<"own" | "all">("own");
  const utils = api.useUtils();
  const recovery = api.audioUsage.recoverExpired.useMutation({
    onSuccess: () => utils.audioUsage.summary.invalidate(),
  });
  const report = api.audioUsage.summary.useQuery(
    { period, scope },
    { refetchInterval: 30_000, refetchIntervalInBackground: false },
  );
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void utils.audioUsage.summary.invalidate();
      }, 500);
    };
    window.addEventListener("audio-usage-settled", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("audio-usage-settled", refresh);
    };
  }, [utils]);
  if (report.isPending)
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Loading audio usage…
      </p>
    );
  if (report.error)
    return (
      <div role="alert" className="text-destructive text-sm">
        Audio usage is temporarily unavailable.{" "}
        <button
          type="button"
          className="underline"
          onClick={() => void report.refetch()}
        >
          Retry
        </button>
      </div>
    );
  const data = report.data;
  const allowances = [
    { label: "Streaming", ...data.allowances.stream, unit: "characters" },
    {
      label: "Recordings",
      ...data.allowances.legacy,
      unit: "standard-equivalent units",
    },
  ];
  return (
    <section
      aria-label="Audio usage and costs"
      className={
        compact
          ? "space-y-3 px-2 py-2"
          : "border-rule bg-surface space-y-6 rounded-xl border p-5"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-foreground text-sm font-semibold">
          Audio usage &amp; costs
        </h3>
        {!compact && (
          <div className="flex flex-wrap gap-2">
            <label className="text-muted-foreground text-xs">
              Month{" "}
              <input
                aria-label="Usage month"
                type="month"
                value={period}
                onChange={(event) => {
                  if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(event.target.value))
                    setPeriod(event.target.value);
                }}
                className="border-rule bg-background text-foreground ml-1 rounded border p-1"
              />
            </label>
            {data.isAdmin && (
              <select
                aria-label="Report scope"
                value={scope}
                onChange={(event) =>
                  setScope(event.target.value as "own" | "all")
                }
                className="border-rule bg-background text-foreground rounded border px-2 text-xs"
              >
                <option value="own">My account</option>
                <option value="all">All accounts</option>
              </select>
            )}
          </div>
        )}
      </div>
      {scope === "own" && (
        <div className="space-y-4">
          {allowances.map((allowance) => (
            <div key={allowance.label}>
              <div className="mb-2 flex justify-between gap-2 text-xs">
                <span className="text-foreground font-medium">
                  {allowance.label}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {count(allowance.used)} / {count(allowance.limit)}
                </span>
              </div>
              <Progress
                aria-label={`${allowance.label} allowance used`}
                value={Math.min(100, (100 * allowance.used) / allowance.limit)}
                className="h-1.5"
              />
              {!compact && (
                <p className="text-muted-foreground mt-1 text-xs">
                  {count(Math.max(0, allowance.limit - allowance.used))}{" "}
                  {allowance.unit} remaining · {count(allowance.reserved)}{" "}
                  reserved (included in used)
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 border-t border-[var(--color-rule)] pt-3">
        <div>
          <p className="text-muted-foreground text-xs">
            Estimated generation cost
          </p>
          <p className="text-foreground mt-1 font-mono text-lg tabular-nums">
            {dollars(data.summary.estimatedUsd)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Cached deliveries</p>
          <p className="text-foreground mt-1 font-mono text-lg tabular-nums">
            {count(data.cachedDeliveries)}
          </p>
        </div>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Estimates before provider credits and infrastructure costs. Cached
        replay has no synthesis charge. App allowances reset{" "}
        {new Date(data.resetDate).toLocaleDateString(undefined, {
          timeZone: "UTC",
          month: "short",
          day: "numeric",
        })}{" "}
        at 00:00 UTC.
      </p>
      {(data.summary.unknownPrice > 0 || data.summary.uncertain > 0) && (
        <p className="text-warning text-xs" role="status">
          {data.summary.pending} in progress · {data.summary.uncertain} pending
          or uncertain · {data.summary.unknownPrice} without a configured rate.
          The estimate may be incomplete.
        </p>
      )}
      {(data.allowanceDifferences.stream !== "0" ||
        data.allowanceDifferences.legacy !== "0") && (
        <p role="status" className="text-muted-foreground text-xs">
          Allowance counters include activity or adjustments outside the
          detailed ledger. Streaming difference:{" "}
          {count(data.allowanceDifferences.stream)}; recording difference:{" "}
          {count(data.allowanceDifferences.legacy)}. Cost coverage is
          incomplete.
        </p>
      )}
      {compact ? (
        <Link
          href="/preferences"
          className="text-accent text-xs underline underline-offset-4"
        >
          View audio details
        </Link>
      ) : (
        <>
          <p className="text-muted-foreground text-xs">
            Detailed tracking since{" "}
            {data.coverageSince
              ? new Date(data.coverageSince).toLocaleString()
              : "not yet initialized"}
            . Earlier allowance counts are preserved; their exact provider costs
            cannot be reconstructed. Prefetched audio counts when generated.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="text-foreground mb-3 text-left text-sm font-medium">
                Generation by voice
              </caption>
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-normal">Provider / voice</th>
                  <th className="px-3 font-normal">Input units</th>
                  <th className="pl-3 text-right font-normal">Est. USD</th>
                </tr>
              </thead>
              <tbody>
                {data.breakdown.map((row, index) => (
                  <tr key={index} className="border-rule border-t">
                    <td className="py-3 pr-3">
                      <span className="text-foreground block">{row.voice}</span>
                      <span className="text-muted-foreground">
                        {row.provider} · {row.environment} · {row.unit}
                      </span>
                    </td>
                    <td className="px-3 tabular-nums">
                      {count(row.requestedUnits)}
                      <span className="text-muted-foreground block">
                        {count(row.reportedUnits)} provider-reported
                      </span>
                    </td>
                    <td className="pl-3 text-right tabular-nums">
                      {row.unknownPrice === row.attempts
                        ? "Rate unavailable"
                        : dollars(row.estimatedUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.breakdown.length && (
              <p className="text-muted-foreground py-4 text-sm">
                No detailed generation records for this month.
              </p>
            )}
          </div>
          {data.recent.length > 0 && (
            <details className="border-rule border-t pt-4">
              <summary className="text-foreground cursor-pointer text-sm">
                Recent attempts and saved audio
              </summary>
              <ul className="mt-3 space-y-3">
                {data.recent.map((row) => (
                  <li key={row.id} className="text-muted-foreground text-xs">
                    <div className="flex justify-between gap-3">
                      <span>
                        {row.articleId ? (
                          <Link
                            className="text-accent underline"
                            href={`/article/${row.articleId}`}
                          >
                            Open article
                          </Link>
                        ) : (
                          "Deleted article"
                        )}{" "}
                        · {row.voice}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {dollars(row.estimatedUsd)}
                      </span>
                    </div>
                    <p className="mt-1">
                      {row.state} · current cache: {row.cacheState} ·{" "}
                      {count(row.reportedUnits ?? row.requestedUnits)} units (
                      {row.measurement})
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {data.history.length > 0 && (
            <details className="border-rule border-t pt-4">
              <summary className="text-foreground cursor-pointer text-sm">
                Preserved allowance history at migration
              </summary>
              <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
                {data.history.map((row) => (
                  <li key={row.source}>
                    {row.source}: {count(row.admittedUnits)} allowance units;{" "}
                    {count(row.rawUnits)} raw units. Cost unknown.
                  </li>
                ))}
              </ul>
            </details>
          )}
          {scope === "all" && (
            <div className="border-rule border-t pt-4">
              <h4 className="text-foreground mb-2 text-sm font-medium">
                Provider billing reconciliation
              </h4>
              <p className="text-muted-foreground mb-3 text-xs">
                Imported provider totals include shared credits, adjustments,
                and potentially usage outside this app. They are not per-user
                invoices. Differences require matching account, environment, and
                coverage dates.
              </p>
              <button
                type="button"
                disabled={recovery.isPending}
                onClick={() => recovery.mutate()}
                className="text-accent mb-3 text-xs underline disabled:opacity-50"
              >
                Settle expired reservations
              </button>
              {recovery.error && (
                <p role="alert" className="text-destructive text-xs">
                  Could not settle expired reservations.
                </p>
              )}
              {data.reconciliation.length ? (
                data.reconciliation.map((row, index) => (
                  <div
                    key={index}
                    className="text-muted-foreground mb-3 text-xs"
                  >
                    {row.provider} · {row.providerAccount} · {row.environment} ·{" "}
                    {row.model}
                    <br />
                    Gross {row.gross} {row.currency} · signed credits{" "}
                    {row.credits} · net {row.net}
                    <br />
                    Tracked estimate: {row.trackedEstimate ?? "Unavailable"} ·
                    gross difference: {row.grossDifference ?? "Unavailable"}.
                    Differences may include historical or outside-app usage.
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-xs">
                  No provider billing import for this month.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
