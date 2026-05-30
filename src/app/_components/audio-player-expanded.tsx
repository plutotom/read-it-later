"use client";

import {
  FileText,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { getDomainFromUrl } from "~/lib/article-url";
import { cn } from "~/lib/utils";
import {
  AudioPlayerSeekBar,
  AudioPlayerSeekTimes,
} from "./audio-player-seek-bar";
import { PlaybackSpeedPicker } from "./playback-speed-picker";

export interface AudioPlayerExpandedProps {
  title: string;
  url: string;
  author?: string | null;
  imageUrl?: string | null;
  voiceLabel?: string | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackSpeed: number;
  disabled?: boolean;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onSelectSpeed: (speed: number) => void;
  onSkip: (deltaSeconds: number) => void;
  onJumpToReadingPosition?: () => void;
}

function ArticleArtwork({
  title,
  imageUrl,
}: {
  title: string;
  imageUrl?: string | null;
}) {
  const initial = title.trim().charAt(0).toUpperCase() || "A";

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[248px] overflow-hidden rounded-[14px] bg-background-deep shadow-[0_8px_32px_rgba(0,0,0,0.28)]">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <>
          <div
            className="absolute inset-0 opacity-40"
            style={{
              background:
                "radial-gradient(circle at 30% 20%, color-mix(in oklch, var(--accent) 45%, transparent), transparent 55%)",
            }}
          />
          <div className="flex h-full flex-col items-center justify-center gap-1.5 p-6">
            <span
              className="font-serif text-[2.75rem] font-medium leading-none text-foreground-soft"
              style={{ fontFamily: "var(--font-app-display)" }}
            >
              {initial}
            </span>
            <span className="text-center text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Narration
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export function AudioPlayerExpanded({
  title,
  url,
  author,
  imageUrl,
  voiceLabel,
  currentTime,
  duration,
  isPlaying,
  playbackSpeed,
  disabled,
  onSeek,
  onTogglePlay,
  onSelectSpeed,
  onSkip,
  onJumpToReadingPosition,
}: AudioPlayerExpandedProps) {
  const domain = getDomainFromUrl(url);
  const metaLine = [domain, author].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <ArticleArtwork title={title} imageUrl={imageUrl} />

      <div className="mt-4 text-center">
        <h2 className="line-clamp-3 text-[22px] font-semibold leading-[1.2] tracking-[-0.02em] text-foreground">
          {title}
        </h2>
        {metaLine ? (
          <p className="mt-1 text-[15px] leading-snug text-muted-foreground">
            {metaLine}
          </p>
        ) : null}
        {voiceLabel ? (
          <p className="mt-0.5 text-[13px] text-muted-foreground">{voiceLabel}</p>
        ) : null}
      </div>

      <div className="mt-5">
        <AudioPlayerSeekBar
          value={currentTime}
          max={duration}
          onChange={onSeek}
          disabled={disabled}
        />
        <AudioPlayerSeekTimes
          current={currentTime}
          duration={duration}
          className="mt-1"
        />
      </div>

      <div className="relative mt-6 flex items-center justify-between overflow-visible px-0.5 pb-1">
        <PlaybackSpeedPicker
          value={playbackSpeed}
          onChange={onSelectSpeed}
          variant="expanded"
          disabled={disabled}
        />

        <button
          type="button"
          onClick={() => onSkip(-15)}
          disabled={disabled}
          className="flex flex-col items-center gap-0.5 text-foreground-soft transition-colors hover:text-foreground disabled:opacity-50"
          aria-label="Rewind 15 seconds"
        >
          <RotateCcw className="size-[1.65rem]" strokeWidth={1.75} />
          <span className="text-[10px] font-semibold tabular-nums">15</span>
        </button>

        <button
          type="button"
          onClick={onTogglePlay}
          disabled={disabled}
          className={cn(
            "flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-foreground text-background transition-transform active:scale-95 disabled:opacity-50",
            isPlaying && "m-pulse",
          )}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause className="size-8" fill="currentColor" />
          ) : (
            <Play className="ml-0.5 size-8" fill="currentColor" />
          )}
        </button>

        <button
          type="button"
          onClick={() => onSkip(30)}
          disabled={disabled}
          className="flex flex-col items-center gap-0.5 text-foreground-soft transition-colors hover:text-foreground disabled:opacity-50"
          aria-label="Forward 30 seconds"
        >
          <RotateCw className="size-[1.65rem]" strokeWidth={1.75} />
          <span className="text-[10px] font-semibold tabular-nums">30</span>
        </button>

        <button
          type="button"
          onClick={onJumpToReadingPosition}
          disabled={disabled || !onJumpToReadingPosition}
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground-soft transition-colors hover:bg-foreground/8 hover:text-foreground disabled:opacity-40"
          aria-label="Scroll to listen position in article"
          title="Scroll to listen position in article"
        >
          <FileText className="size-5" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
