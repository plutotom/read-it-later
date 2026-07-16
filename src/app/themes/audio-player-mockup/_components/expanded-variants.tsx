"use client";

import { FileText, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { MATTER_DARK as p } from "./palette";
import { SeekBar, SeekTimeLabels } from "./seek-bar";
import type { ExpandedVariant, MockArticle, MockPlayback } from "./types";

interface ExpandedContentProps {
  variant: ExpandedVariant;
  article: MockArticle;
  playback: MockPlayback;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onCycleSpeed: () => void;
}

function ArticleArtwork({ title }: { title: string }) {
  const initial = title.trim().charAt(0).toUpperCase() || "A";

  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-2xl border"
      style={{
        borderColor: p.rule,
        background: `linear-gradient(145deg, ${p.paperDeep} 0%, ${p.surface} 55%, ${p.paper} 100%)`,
        boxShadow: p.shadowStrong,
      }}
    >
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `radial-gradient(circle at 30% 20%, ${p.accent}55, transparent 50%)`,
        }}
      />
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6">
        <span
          className="font-serif text-5xl font-medium"
          style={{ color: p.inkSoft }}
        >
          {initial}
        </span>
        <span
          className="text-center text-[10px] tracking-[0.2em] uppercase"
          style={{ color: p.inkMute }}
        >
          Narration
        </span>
      </div>
    </div>
  );
}

/** Variant A — podcast-style “now playing” (reference image 3). */
function ClassicExpanded({
  article,
  playback,
  onSeek,
  onTogglePlay,
  onCycleSpeed,
}: Omit<ExpandedContentProps, "variant">) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pt-2 pb-8">
      <ArticleArtwork title={article.title} />

      <div className="mt-6 min-h-0 flex-1">
        <h2
          className="line-clamp-3 font-sans text-[20px] leading-snug font-semibold tracking-tight"
          style={{ color: p.ink }}
        >
          {article.title}
        </h2>
        <p className="mt-2 text-[14px]" style={{ color: p.inkMute }}>
          {article.domain} · {article.author}
        </p>
      </div>

      <div className="mt-auto shrink-0 space-y-1 pt-6">
        <SeekBar
          value={playback.currentTime}
          max={playback.duration}
          onChange={onSeek}
          size="comfortable"
        />
        <SeekTimeLabels
          current={playback.currentTime}
          duration={playback.duration}
        />

        <div className="mt-8 flex items-center justify-between px-1">
          <button
            type="button"
            onClick={onCycleSpeed}
            className="min-w-[52px] text-left text-[15px] font-medium tabular-nums"
            style={{ color: p.inkSoft }}
          >
            {playback.playbackSpeed}x
          </button>

          <button
            type="button"
            className="flex flex-col items-center gap-0.5"
            style={{ color: p.inkSoft }}
            aria-label="Rewind 15 seconds"
          >
            <RotateCcw className="size-7" strokeWidth={1.5} />
            <span className="text-[10px] font-medium">15</span>
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: p.ink, color: p.paper }}
            aria-label={playback.isPlaying ? "Pause" : "Play"}
          >
            {playback.isPlaying ? (
              <Pause className="size-7" fill="currentColor" />
            ) : (
              <Play className="ml-1 size-7" fill="currentColor" />
            )}
          </button>

          <button
            type="button"
            className="flex flex-col items-center gap-0.5"
            style={{ color: p.inkSoft }}
            aria-label="Forward 30 seconds"
          >
            <RotateCw className="size-7" strokeWidth={1.5} />
            <span className="text-[10px] font-medium">30</span>
          </button>

          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ color: p.inkSoft }}
            aria-label="Jump to position in article"
          >
            <FileText className="size-5" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Variant B — reader-first: title, progress through article, voice. */
function ReaderExpanded({
  article,
  playback,
  onSeek,
  onTogglePlay,
  onCycleSpeed,
}: Omit<ExpandedContentProps, "variant">) {
  const readPct = Math.round((playback.currentTime / playback.duration) * 100);

  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pt-4 pb-8">
      <p
        className="text-[11px] font-medium tracking-[0.16em] uppercase"
        style={{ color: p.inkMute }}
      >
        Now listening
      </p>
      <h2
        className="mt-2 line-clamp-4 font-serif text-[22px] leading-snug"
        style={{ color: p.ink }}
      >
        {article.title}
      </h2>

      <div
        className="mt-4 flex flex-wrap gap-2 text-[12px]"
        style={{ color: p.inkSoft }}
      >
        <span
          className="rounded-full border px-2.5 py-1"
          style={{ borderColor: p.rule }}
        >
          {article.domain}
        </span>
        <span
          className="rounded-full border px-2.5 py-1"
          style={{ borderColor: p.rule }}
        >
          {article.readingTime} min read
        </span>
        <span
          className="rounded-full border px-2.5 py-1"
          style={{ borderColor: p.rule }}
        >
          Voice · Nova
        </span>
      </div>

      <div
        className="mt-6 rounded-xl border p-4"
        style={{ borderColor: p.rule, background: p.paperDeep }}
      >
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px]" style={{ color: p.inkMute }}>
              Through article
            </p>
            <p
              className="text-[28px] font-semibold tracking-tight tabular-nums"
              style={{ color: p.ink }}
            >
              {readPct}%
            </p>
          </div>
          <div className="text-right text-[12px]" style={{ color: p.inkMute }}>
            <p>
              ~
              {Math.max(
                1,
                Math.ceil((playback.duration - playback.currentTime) / 60),
              )}{" "}
              min left
            </p>
            <p className="mt-0.5">at {playback.playbackSpeed}x</p>
          </div>
        </div>
        <div
          className="mt-4 h-1.5 overflow-hidden rounded-full"
          style={{ background: p.surface }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${readPct}%`, background: p.accent }}
          />
        </div>
      </div>

      <div className="mt-auto shrink-0 pt-8">
        <SeekBar
          value={playback.currentTime}
          max={playback.duration}
          onChange={onSeek}
          size="hero"
        />
        <SeekTimeLabels
          current={playback.currentTime}
          duration={playback.duration}
          align="center"
        />

        <div className="mt-8 flex items-center justify-center gap-6">
          <button
            type="button"
            onClick={onCycleSpeed}
            className="rounded-full border px-4 py-2 text-[13px] font-medium"
            style={{ borderColor: p.rule, color: p.inkSoft }}
          >
            {playback.playbackSpeed}x
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: p.accent, color: p.paper }}
          >
            {playback.isPlaying ? (
              <Pause className="size-6" />
            ) : (
              <Play className="ml-0.5 size-6" />
            )}
          </button>
          <button
            type="button"
            className="rounded-full border px-4 py-2 text-[13px]"
            style={{ borderColor: p.rule, color: p.inkSoft }}
          >
            −15 · +30
          </button>
        </div>
      </div>
    </div>
  );
}

/** Variant C — scrub-first: oversized seek, minimal chrome. */
function ScrubExpanded({
  article,
  playback,
  onSeek,
  onTogglePlay,
  onCycleSpeed,
}: Omit<ExpandedContentProps, "variant">) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pt-6 pb-8">
      <div className="flex items-start gap-4">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border font-serif text-2xl"
          style={{
            borderColor: p.rule,
            background: p.paperDeep,
            color: p.inkSoft,
          }}
        >
          {article.title.charAt(0)}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p
            className="line-clamp-2 text-[15px] leading-snug font-medium"
            style={{ color: p.ink }}
          >
            {article.title}
          </p>
          <p className="mt-1 truncate text-[12px]" style={{ color: p.inkMute }}>
            {article.domain}
          </p>
        </div>
      </div>

      <div className="mt-10 flex-1">
        <p
          className="mb-6 text-center text-[13px]"
          style={{ color: p.inkMute }}
        >
          Drag to scrub — large touch target
        </p>
        <SeekBar
          value={playback.currentTime}
          max={playback.duration}
          onChange={onSeek}
          size="hero"
          showThumb
        />
        <SeekTimeLabels
          current={playback.currentTime}
          duration={playback.duration}
        />

        {/* Decorative waveform hint (static mock) */}
        <div
          className="mt-10 flex h-12 items-end justify-center gap-[3px] px-2"
          aria-hidden
        >
          {Array.from({ length: 48 }).map((_, i) => {
            const h = 20 + Math.sin(i * 0.45) * 14 + (i % 5) * 3;
            const played = i / 48 < playback.currentTime / playback.duration;
            return (
              <span
                key={i}
                className="w-[3px] rounded-full"
                style={{
                  height: h,
                  background: played ? p.accent : p.rule,
                  opacity: played ? 1 : 0.55,
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between pt-4">
        <button
          type="button"
          onClick={onCycleSpeed}
          className="text-[15px] font-medium tabular-nums"
          style={{ color: p.inkSoft }}
        >
          {playback.playbackSpeed}x
        </button>
        <div className="flex items-center gap-5">
          <button
            type="button"
            style={{ color: p.inkSoft }}
            aria-label="Back 15s"
          >
            <RotateCcw className="size-6" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: p.accent, color: p.paper }}
          >
            {playback.isPlaying ? (
              <Pause className="size-6" />
            ) : (
              <Play className="ml-0.5 size-6" />
            )}
          </button>
          <button
            type="button"
            style={{ color: p.inkSoft }}
            aria-label="Forward 30s"
          >
            <RotateCw className="size-6" strokeWidth={1.5} />
          </button>
        </div>
        <div className="w-10" />
      </div>
    </div>
  );
}

export function ExpandedVariantContent(props: ExpandedContentProps) {
  switch (props.variant) {
    case "reader":
      return <ReaderExpanded {...props} />;
    case "scrub":
      return <ScrubExpanded {...props} />;
    default:
      return <ClassicExpanded {...props} />;
  }
}

export const VARIANT_LABELS: Record<
  ExpandedVariant,
  { title: string; blurb: string }
> = {
  classic: {
    title: "Classic",
    blurb:
      "Podcast-style sheet: artwork, title, skip controls (like your reference).",
  },
  reader: {
    title: "Reader",
    blurb: "Article context first: % through piece, voice, reading time left.",
  },
  scrub: {
    title: "Scrub-first",
    blurb: "Oversized seek + waveform hint — easiest to drag while listening.",
  },
};
