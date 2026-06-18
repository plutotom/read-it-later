"use client";

import { cn } from "~/lib/utils";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

interface AudioPlayerSeekBarProps {
  value: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}

export function AudioPlayerSeekBar({
  value,
  max,
  onChange,
  disabled,
  className,
}: AudioPlayerSeekBarProps) {
  const pct = max > 0 ? (value / max) * 100 : 0;

  return (
    <div className={cn("relative w-full", className)}>
      <div
        className="relative h-2 overflow-hidden rounded-full bg-background-deep"
        aria-hidden
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-150 ease-out"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 size-5 -translate-y-1/2 rounded-full border-2 border-accent bg-foreground shadow-md"
          style={{ left: `calc(${pct}% - 10px)` }}
        />
      </div>
      <input
        type="range"
        min={0}
        max={max || 0}
        step={0.1}
        value={value}
        disabled={!!disabled || max <= 0}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        aria-label="Seek playback position"
      />
    </div>
  );
}

export function AudioPlayerSeekTimes({
  current,
  duration,
  className,
}: {
  current: number;
  duration: number;
  className?: string;
}) {
  const remaining = Math.max(0, duration - current);

  return (
    <div
      className={cn(
        "flex justify-between text-[13px] tabular-nums text-muted-foreground",
        className,
      )}
    >
      <span>{formatTime(current)}</span>
      <span>−{formatTime(remaining)}</span>
    </div>
  );
}
