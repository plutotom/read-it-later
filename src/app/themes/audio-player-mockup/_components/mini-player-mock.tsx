"use client";

import { Headphones, Pause, Play } from "lucide-react";
import { MATTER_DARK as p } from "./palette";
import type { MockPlayback } from "./types";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

interface MiniPlayerMockProps {
  mode: "idle" | "playing";
  playback: MockPlayback;
  onPlayClick: (e: React.MouseEvent) => void;
  onSpeedClick: (e: React.MouseEvent) => void;
  onBodyClick: () => void;
}

export function MiniPlayerMock({
  mode,
  playback,
  onPlayClick,
  onSpeedClick,
  onBodyClick,
}: MiniPlayerMockProps) {
  const progress =
    playback.duration > 0
      ? (playback.currentTime / playback.duration) * 100
      : 0;

  if (mode === "idle") {
    return (
      <div
        className="rounded-2xl border px-4 py-3"
        style={{
          background: p.surface,
          borderColor: p.rule,
          boxShadow: p.shadowStrong,
        }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onPlayClick}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ background: p.accent, color: p.paper }}
            aria-label="Generate narration"
          >
            <Headphones className="size-4" />
          </button>
          <button
            type="button"
            onClick={onBodyClick}
            className="min-w-0 flex-1 text-left"
            aria-label="Open expanded player"
          >
            <div
              className="truncate text-[13px] font-medium tracking-tight"
              style={{ color: p.ink }}
            >
              Generate narration
            </div>
            <div className="text-[11px]" style={{ color: p.inkMute }}>
              Listen in Matter mode
            </div>
          </button>
          <button
            type="button"
            onClick={onSpeedClick}
            className="rounded-full border px-3 py-1 text-xs"
            style={{ borderColor: p.rule, color: p.inkSoft }}
          >
            {playback.playbackSpeed}x
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border px-4 py-3"
      style={{
        background: p.surface,
        borderColor: p.rule,
        boxShadow: p.shadowStrong,
      }}
    >
      <div
        className="mb-3 h-1.5 cursor-pointer rounded-full"
        style={{ background: p.paperDeep }}
        onClick={onBodyClick}
        role="presentation"
      >
        <div
          className="h-full rounded-full transition-[width] duration-150"
          style={{ width: `${progress}%`, background: p.accent }}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPlayClick}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: p.accent, color: p.paper }}
          aria-label={playback.isPlaying ? "Pause" : "Play"}
        >
          {playback.isPlaying ? (
            <Pause className="size-4" />
          ) : (
            <Play className="ml-0.5 size-4" />
          )}
        </button>

        {playback.isPlaying ? (
          <div className="flex items-end gap-0.5" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="m-bar w-0.5 rounded-sm"
                style={{
                  height: 18,
                  background: p.accent,
                  animationDelay: `${i * 120}ms`,
                }}
              />
            ))}
          </div>
        ) : (
          <div className="h-4 w-2 shrink-0" />
        )}

        <button
          type="button"
          onClick={onBodyClick}
          className="min-w-0 flex-1 text-left"
          aria-label="Open expanded player"
        >
          <div
            className="truncate text-[13px] font-medium tracking-tight"
            style={{ color: p.ink }}
          >
            Article narration
          </div>
          <div className="text-[11px]" style={{ color: p.inkMute }}>
            {formatTime(playback.currentTime)} / {formatTime(playback.duration)}
          </div>
        </button>

        <button
          type="button"
          onClick={onSpeedClick}
          className="rounded-full border px-3 py-1 text-xs"
          style={{ borderColor: p.rule, color: p.inkSoft }}
        >
          {playback.playbackSpeed}x
        </button>
      </div>
    </div>
  );
}
