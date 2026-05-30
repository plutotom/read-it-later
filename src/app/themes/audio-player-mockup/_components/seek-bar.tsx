"use client";

import { MATTER_DARK as p } from "./palette";

interface SeekBarProps {
  value: number;
  max: number;
  onChange: (value: number) => void;
  size?: "compact" | "comfortable" | "hero";
  showThumb?: boolean;
}

export function SeekBar({
  value,
  max,
  onChange,
  size = "comfortable",
  showThumb = true,
}: SeekBarProps) {
  const pct = max > 0 ? (value / max) * 100 : 0;

  const trackHeights = {
    compact: "h-1.5",
    comfortable: "h-2",
    hero: "h-3",
  } as const;

  const thumbSizes = {
    compact: "h-3.5 w-3.5",
    comfortable: "h-5 w-5",
    hero: "h-6 w-6",
  } as const;

  return (
    <div className="relative w-full">
      <div
        className={`relative overflow-hidden rounded-full ${trackHeights[size]}`}
        style={{ background: p.paperDeep }}
      >
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${trackHeights[size]}`}
          style={{ width: `${pct}%`, background: p.accent }}
        />
        {showThumb && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 rounded-full border-2 shadow-md ${thumbSizes[size]}`}
            style={{
              left: `calc(${pct}% - ${size === "hero" ? 12 : size === "comfortable" ? 10 : 7}px)`,
              background: p.ink,
              borderColor: p.accent,
            }}
          />
        )}
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={0.1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label="Seek playback position"
      />
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function SeekTimeLabels({
  current,
  duration,
  align = "spread",
}: {
  current: number;
  duration: number;
  align?: "spread" | "center";
}) {
  const remaining = Math.max(0, duration - current);

  if (align === "center") {
    return (
      <p
        className="mt-2 text-center text-[12px] tabular-nums"
        style={{ color: p.inkMute }}
      >
        {formatTime(current)} · {formatTime(remaining)} left
      </p>
    );
  }

  return (
    <div
      className="mt-2 flex justify-between text-[12px] tabular-nums"
      style={{ color: p.inkMute }}
    >
      <span>{formatTime(current)}</span>
      <span>−{formatTime(remaining)}</span>
    </div>
  );
}
