"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  HardDrive,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  CACHE_LIMITS,
  formatStorageBytes,
  STORAGE_EVENT,
  type AudioStorageStats,
} from "~/lib/browser-audio-storage";
import { useBrowserStorage } from "./browser-storage-provider";

export function ManageStorage() {
  const storage = useBrowserStorage();
  const [stats, setStats] = useState<AudioStorageStats>();
  const [quota, setQuota] = useState<number>();
  const [persistent, setPersistent] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const sequence = useRef(0);
  const invalidateRefresh = useCallback(() => {
    sequence.current++;
  }, []);

  const refresh = useCallback(async () => {
    if (!storage) return;
    const current = ++sequence.current;
    try {
      const [next, estimate, persisted] = await Promise.all([
        storage.stats(),
        navigator.storage?.estimate?.().catch(() => undefined),
        navigator.storage?.persisted?.().catch(() => false),
      ]);
      if (current !== sequence.current) return;
      setStats(next);
      setQuota(estimate?.quota);
      setPersistent(!!persisted);
    } catch (cause) {
      if (current === sequence.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Browser storage is unavailable.",
        );
    }
  }, [storage]);

  useEffect(() => {
    void refresh();
    const update = () => void refresh();
    window.addEventListener(STORAGE_EVENT, update);
    window.addEventListener("focus", update);
    const interval = window.setInterval(update, 3000);
    return () => {
      invalidateRefresh();
      window.clearInterval(interval);
      window.removeEventListener(STORAGE_EVENT, update);
      window.removeEventListener("focus", update);
    };
  }, [refresh, invalidateRefresh]);

  async function run(action: () => Promise<unknown>, success: string) {
    if (busy) return false;
    setBusy(true);
    setMessage(undefined);
    setError(undefined);
    try {
      await action();
      await refresh();
      setMessage(success);
      return true;
    } catch (cause) {
      setError(
        cause instanceof DOMException && cause.name === "QuotaExceededError"
          ? "This browser is out of storage. Remove some downloads and try again."
          : cause instanceof Error
            ? cause.message
            : "Could not update storage. Please try again.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  const disabled = !stats || busy;
  const used = stats?.cacheBytes ?? 0;
  const limitLabel =
    CACHE_LIMITS.find((limit) => limit.bytes === stats?.limit)?.label ??
    "200 MB";

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-8 sm:py-12">
      <Link
        href="/preferences"
        className="text-muted-foreground hover:text-foreground mb-8 inline-flex min-h-10 items-center gap-2 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        Preferences
      </Link>
      <div className="mb-8">
        <p className="text-muted-foreground mb-2 text-xs font-medium tracking-[0.18em] uppercase">
          This browser · This device
        </p>
        <h1
          className="text-foreground text-4xl font-medium tracking-tight"
          style={{ fontFamily: "var(--font-app-display)" }}
        >
          Manage storage
        </h1>
        <p className="text-foreground-soft mt-3 text-sm leading-relaxed">
          A little room for your next listen. Choose how much audio to keep
          here.
        </p>
      </div>

      <section
        aria-labelledby="cache-heading"
        className="border-rule bg-surface overflow-hidden rounded-2xl border shadow-[var(--shadow-soft)]"
      >
        <div className="p-6 sm:p-8">
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <HardDrive className="size-4" />
            <h2 id="cache-heading">Cached audio</h2>
          </div>
          <div
            aria-live="polite"
            aria-atomic="true"
            className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1"
          >
            <span
              className="text-foreground text-5xl font-medium tracking-tight tabular-nums"
              data-testid="cache-usage"
            >
              {stats ? formatStorageBytes(used) : "—"}
            </span>
            <span className="text-muted-foreground text-sm">
              {stats?.limit === 0 ? "no app limit" : `of ${limitLabel}`}
            </span>
          </div>
          {stats && stats.limit > 0 && (
            <div
              role="progressbar"
              aria-label="Cache used"
              aria-valuemin={0}
              aria-valuemax={stats.limit}
              aria-valuenow={used}
              aria-valuetext={`${formatStorageBytes(used)} of ${limitLabel}`}
              className="bg-background-deep mt-5 h-1.5 overflow-hidden rounded-full"
            >
              <div
                className="bg-accent h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
                style={{
                  width: `${Math.min(100, (used / stats.limit) * 100)}%`,
                }}
              />
            </div>
          )}
          <p className="text-muted-foreground mt-3 text-xs">
            {stats
              ? `${stats.cacheCount} cached ${stats.cacheCount === 1 ? "file" : "files"}`
              : "Checking local storage…"}
            {quota
              ? ` · Browser quota: approximately ${formatStorageBytes(quota)}`
              : ""}
          </p>
        </div>
        <div className="border-rule flex flex-wrap items-center justify-between gap-4 border-t px-6 py-5 sm:px-8">
          <div>
            <label
              id="cache-limit-label"
              className="text-foreground text-sm font-medium"
            >
              Cache limit
            </label>
            <p className="text-muted-foreground mt-1 text-xs">
              Older audio makes room automatically.
            </p>
          </div>
          <Select
            value={String(stats?.limit ?? 200_000_000)}
            disabled={disabled}
            onValueChange={(value) => {
              if (storage)
                void run(
                  () => storage.setLimit(Number(value)),
                  "Cache limit updated.",
                );
            }}
          >
            <SelectTrigger
              aria-labelledby="cache-limit-label"
              className="min-w-32"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CACHE_LIMITS.map((limit) => (
                <SelectItem key={limit.bytes} value={String(limit.bytes)}>
                  {limit.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="border-rule flex flex-wrap items-center justify-between gap-4 border-t px-6 py-5 sm:px-8">
          <div className="max-w-sm">
            <h3 className="text-foreground text-sm font-medium">Clear cache</h3>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              Free temporary audio space. Audio you chose to keep stays here.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={disabled || used === 0}
            onClick={() => {
              if (storage)
                void run(
                  () => storage.clear(),
                  "Cache cleared. Your downloads are still here.",
                );
            }}
          >
            <RefreshCw className="size-4" />
            Clear cache
          </Button>
        </div>
      </section>

      <p className="text-muted-foreground mt-4 px-1 text-xs leading-relaxed">
        Lowering the limit frees space immediately. Unused temporary audio
        expires after 28 days. Unlimited still depends on available browser
        storage.
      </p>

      <section
        aria-labelledby="downloads-heading"
        className="border-rule bg-surface mt-8 rounded-2xl border p-6 shadow-[var(--shadow-soft)] sm:p-8"
      >
        <div className="flex items-start gap-3">
          <Download className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <h2
              id="downloads-heading"
              className="text-foreground text-sm font-medium"
            >
              Audio you chose to keep
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {stats
                ? `${formatStorageBytes(stats.downloadBytes)} · ${stats.downloadCount} ${stats.downloadCount === 1 ? "download" : "downloads"}`
                : "—"}
            </p>
          </div>
        </div>
        <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
          Use “Keep audio on this browser” in the expanded player to save a
          download. Downloads are separate from the cache limit. Opening your
          library still needs an internet connection.
        </p>
        <Button
          variant="ghost"
          className="text-destructive hover:text-destructive mt-5 h-auto min-h-11 justify-start px-0 text-left whitespace-normal hover:bg-transparent"
          disabled={disabled || (used === 0 && stats?.downloadBytes === 0)}
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="size-4 shrink-0" />
          Remove all cached files &amp; downloads
        </Button>
      </section>
      <p className="text-muted-foreground mt-4 px-1 text-xs leading-relaxed">
        Your saved articles, highlights, notes, and server audio stay in your
        account. Local audio is removed when you sign out.{" "}
        {persistent
          ? "Storage protection is enabled for this site."
          : "Your browser may remove local files to reclaim space."}
      </p>

      <div
        className="mt-5 min-h-6 text-sm"
        aria-live="polite"
        aria-atomic="true"
      >
        {busy && (
          <span className="text-muted-foreground inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Updating storage…
          </span>
        )}
        {error && (
          <div role="alert" className="text-destructive space-y-2">
            <p>{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setError(undefined);
                void refresh();
              }}
            >
              Try again
            </Button>
          </div>
        )}
        {!busy && !error && message && (
          <p className="text-foreground-soft">{message}</p>
        )}
      </div>

      <Dialog
        open={confirming}
        onOpenChange={(open) => {
          if (!busy) setConfirming(open);
        }}
      >
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>Remove local audio?</DialogTitle>
            <DialogDescription>
              This removes cached audio and your audio downloads from this
              browser and stops playback. Your saved articles, highlights,
              notes, and server audio stay in your account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (storage)
                  void run(
                    () => storage.clear(true),
                    "Local cache and downloads removed.",
                  ).then((ok) => {
                    if (ok) setConfirming(false);
                  });
              }}
            >
              {busy ? "Removing…" : "Remove caches & downloads"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
