"use client";

import { useRef, useState } from "react";
import { cn } from "~/lib/utils";

const SEEK_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

interface AudioPlayerSeekBarProps {
  value: number;
  max: number;
  onChange: (value: number) => void;
  /** Streaming commits once per gesture so scrubbing cannot synthesize intermediate passages. */
  commitOnRelease?: boolean;
  disabled?: boolean;
  className?: string;
}

export function AudioPlayerSeekBar({
  value,
  max,
  onChange,
  commitOnRelease = false,
  disabled,
  className,
}: AudioPlayerSeekBarProps) {
  const [preview, setPreview] = useState<number | null>(null);
  const pending = useRef<number | null>(null);
  const interaction = useRef<"pointer" | "keyboard" | null>(null);
  const finish = (commit: boolean) => {
    const next = pending.current;
    pending.current = null;
    interaction.current = null;
    setPreview(null);
    if (commit && next !== null) onChange(next);
  };
  const displayed = preview ?? value;
  const pct = max > 0 ? (displayed / max) * 100 : 0;

  return (
    <div className={cn("relative w-full", className)}>
      <div
        className="bg-background-deep relative h-2 overflow-hidden rounded-full"
        aria-hidden
      >
        <div
          className="bg-accent absolute inset-y-0 left-0 rounded-full transition-[width] duration-150 ease-out"
          style={{ width: `${pct}%` }}
        />
        <div
          className="border-accent bg-foreground absolute top-1/2 size-5 -translate-y-1/2 rounded-full border-2 shadow-md"
          style={{ left: `calc(${pct}% - 10px)` }}
        />
      </div>
      <input
        type="range"
        min={0}
        max={max || 0}
        step={0.1}
        value={displayed}
        disabled={!!disabled || max <= 0}
        onChange={(e) => {
          const next = parseFloat(e.target.value);
          if (commitOnRelease && interaction.current) {
            pending.current = next;
            setPreview(next);
          } else {
            // Assistive technology can change a range without a pointer/key gesture.
            onChange(next);
          }
        }}
        onPointerDown={
          commitOnRelease
            ? (event) => {
                interaction.current = "pointer";
                event.currentTarget.setPointerCapture?.(event.pointerId);
              }
            : undefined
        }
        onPointerUp={commitOnRelease ? () => finish(true) : undefined}
        onPointerCancel={commitOnRelease ? () => finish(false) : undefined}
        onLostPointerCapture={
          commitOnRelease
            ? () => {
                if (interaction.current === "pointer") finish(true);
              }
            : undefined
        }
        onKeyDown={
          commitOnRelease
            ? (event) => {
                if (SEEK_KEYS.has(event.key)) interaction.current = "keyboard";
              }
            : undefined
        }
        onKeyUp={
          commitOnRelease
            ? (event) => {
                if (
                  SEEK_KEYS.has(event.key) &&
                  interaction.current === "keyboard"
                )
                  finish(true);
              }
            : undefined
        }
        onBlur={commitOnRelease ? () => finish(true) : undefined}
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
        "text-muted-foreground flex justify-between text-[13px] tabular-nums",
        className,
      )}
    >
      <span>{formatTime(current)}</span>
      <span>−{formatTime(remaining)}</span>
    </div>
  );
}
