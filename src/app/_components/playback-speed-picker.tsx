"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  formatPlaybackSpeed,
  PLAYBACK_SPEEDS_DESCENDING,
} from "~/lib/playback-speed";
import { cn } from "~/lib/utils";

interface PlaybackSpeedPickerProps {
  value: number;
  onChange: (speed: number) => void;
  disabled?: boolean;
  /** Mini dock pill vs expanded sheet text control */
  variant?: "mini" | "expanded";
  className?: string;
}

function SpeedMenuItems({
  value,
  disabled,
  onPick,
}: {
  value: number;
  disabled?: boolean;
  onPick: (speed: number) => void;
}) {
  return (
    <>
      {PLAYBACK_SPEEDS_DESCENDING.map((speed) => {
        const selected = value === speed;
        return (
          <button
            key={speed}
            type="button"
            disabled={disabled}
            onClick={() => onPick(speed)}
            className={cn(
              "flex h-9 w-full items-center justify-between gap-2 px-3",
              "text-[17px] leading-none tabular-nums tracking-tight text-foreground-soft",
              "transition-colors active:bg-foreground/8",
              selected && "font-medium text-foreground",
            )}
          >
            <span>{formatPlaybackSpeed(speed)}</span>
            {selected ? (
              <Check
                className="size-3.5 shrink-0 text-foreground"
                strokeWidth={2.5}
                aria-hidden
              />
            ) : (
              <span className="size-3.5 shrink-0" aria-hidden />
            )}
          </button>
        );
      })}
    </>
  );
}

/** Inline menu inside the sheet — avoids iOS modal + portal stacking bugs. */
function ExpandedPlaybackSpeedPicker({
  value,
  onChange,
  disabled,
  className,
}: Omit<PlaybackSpeedPickerProps, "variant">) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative z-30", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={cn(
          "min-w-[3rem] text-left text-[17px] font-normal tabular-nums text-foreground-soft transition-colors hover:text-foreground disabled:opacity-50",
          open && "text-foreground",
        )}
        aria-label="Playback speed"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {formatPlaybackSpeed(value)}
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Playback speed"
          className="playback-speed-menu absolute bottom-full left-0 z-50 mb-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          <SpeedMenuItems
            value={value}
            disabled={disabled}
            onPick={(speed) => {
              onChange(speed);
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function MiniPlaybackSpeedPicker({
  value,
  onChange,
  disabled,
  className,
}: Omit<PlaybackSpeedPickerProps, "variant">) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "shrink-0 rounded-full border border-rule px-3 text-xs font-medium tabular-nums text-foreground-soft hover:bg-background-deep hover:text-foreground",
            className,
          )}
          aria-label="Playback speed"
        >
          {formatPlaybackSpeed(value)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="center"
        sideOffset={10}
        collisionPadding={12}
        className={cn(
          "playback-speed-menu z-[100] min-w-0 overflow-hidden p-0",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "data-[side=top]:slide-in-from-bottom-2",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {PLAYBACK_SPEEDS_DESCENDING.map((speed) => {
          const selected = value === speed;
          return (
            <DropdownMenuItem
              key={speed}
              disabled={disabled}
              onSelect={() => onChange(speed)}
              className={cn(
                "flex h-9 cursor-pointer items-center justify-between gap-2 rounded-none px-3 py-0",
                "text-[17px] leading-none tabular-nums tracking-tight text-foreground-soft",
                "focus:bg-foreground/8 focus:text-foreground",
                "data-[highlighted]:bg-foreground/8 data-[highlighted]:text-foreground",
                selected && "font-medium text-foreground",
              )}
            >
              <span>{formatPlaybackSpeed(speed)}</span>
              {selected ? (
                <Check
                  className="size-3.5 shrink-0 text-foreground"
                  strokeWidth={2.5}
                  aria-hidden
                />
              ) : (
                <span className="size-3.5 shrink-0" aria-hidden />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PlaybackSpeedPicker({
  value,
  onChange,
  disabled,
  variant = "mini",
  className,
}: PlaybackSpeedPickerProps) {
  if (variant === "expanded") {
    return (
      <ExpandedPlaybackSpeedPicker
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={className}
      />
    );
  }

  return (
    <MiniPlaybackSpeedPicker
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={className}
    />
  );
}
