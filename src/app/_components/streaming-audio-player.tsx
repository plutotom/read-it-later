"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import {
  Headphones,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  ChevronUp,
} from "lucide-react";
import type { ListeningController } from "~/lib/listening/controller";
import type { ListeningVoice } from "~/lib/listening/protocol";
import { rangeFromOffsets } from "~/lib/highlight-anchor";
import { AudioPlayerExpanded } from "./audio-player-expanded";
import { AudioPlayerSheet } from "./audio-player-sheet";
import { PlaybackSpeedPicker } from "./playback-speed-picker";

interface Props {
  controller: ListeningController;
  voices: ListeningVoice[];
  title: string;
  url: string;
  author?: string | null;
  imageUrl?: string | null;
  contentRef: RefObject<HTMLElement | null>;
  onPlayingChange?: (playing: boolean) => void;
}

export function StreamingAudioPlayer({
  controller,
  voices,
  title,
  url,
  author,
  imageUrl,
  contentRef,
  onPlayingChange,
}: Props) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [expanded, setExpanded] = useState(false);
  const buffering = snapshot.state === "buffering";
  const failed = snapshot.state === "error";
  useEffect(() => {
    onPlayingChange?.(snapshot.wantsPlayback);
    return () => onPlayingChange?.(false);
  }, [onPlayingChange, snapshot.wantsPlayback]);
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: author ?? "Read it later",
    });
    navigator.mediaSession.setActionHandler("play", () => {
      void controller.resume();
    });
    navigator.mediaSession.setActionHandler("pause", () => controller.pause());
    navigator.mediaSession.setActionHandler("seekbackward", (event) =>
      controller.seek(
        controller.getSnapshot().elapsed - (event.seekOffset ?? 15),
      ),
    );
    navigator.mediaSession.setActionHandler("seekforward", (event) =>
      controller.seek(
        controller.getSnapshot().elapsed + (event.seekOffset ?? 30),
      ),
    );
    return () => {
      for (const action of [
        "play",
        "pause",
        "seekbackward",
        "seekforward",
      ] as const)
        navigator.mediaSession.setActionHandler(action, null);
      navigator.mediaSession.metadata = null;
    };
  }, [controller, title, author]);
  useEffect(() => {
    if ("mediaSession" in navigator)
      navigator.mediaSession.playbackState = snapshot.wantsPlayback
        ? "playing"
        : "paused";
  }, [snapshot.wantsPlayback]);
  const jumpToText = () => {
    const root = contentRef.current;
    const paragraph =
      snapshot.paragraph ??
      controller.document.paragraphs[
        controller.document.segments[snapshot.segment]?.paragraph ?? 0
      ];
    if (!root || !paragraph) return;
    rangeFromOffsets(
      root,
      paragraph.start,
      paragraph.end,
    )?.startContainer.parentElement?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
    setExpanded(false);
  };
  const status = failed
    ? "Couldn’t play this passage"
    : buffering
      ? "Preparing this passage…"
      : snapshot.state === "idle"
        ? "Listen to this article"
        : snapshot.state === "finished"
          ? "Finished listening"
          : snapshot.state === "paused"
            ? "Paused"
            : "Reading paragraph " +
              ((controller.document.segments[snapshot.segment]?.paragraph ??
                0) +
                1);
  return (
    <>
      <div className="border-rule bg-surface rounded-2xl border px-4 py-3 shadow-[var(--shadow-strong)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => controller.toggle()}
            aria-label={
              snapshot.wantsPlayback
                ? "Pause listening"
                : failed
                  ? "Retry this passage"
                  : "Play article"
            }
            className="bg-foreground text-background flex size-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95"
          >
            {snapshot.wantsPlayback ? (
              <Pause className="size-5" fill="currentColor" />
            ) : failed ? (
              <RotateCcw className="size-5" />
            ) : (
              <Play className="ml-0.5 size-5" fill="currentColor" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="min-w-0 flex-1 text-left"
            aria-label="Open listening controls"
          >
            <span className="text-foreground flex items-center gap-1.5 text-sm font-medium">
              {buffering ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Headphones className="size-3.5" />
              )}
              {status}
            </span>
            <span className="text-muted-foreground block truncate text-xs">
              {snapshot.voice.name}
            </span>
          </button>
          <PlaybackSpeedPicker
            value={snapshot.rate}
            onChange={(rate) => controller.setRate(rate)}
          />
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Expand listening controls"
            className="text-muted-foreground hover:text-foreground flex size-10 items-center justify-center"
          >
            <ChevronUp className="size-5" />
          </button>
        </div>
        {snapshot.state !== "idle" && (
          <div
            className="bg-background-deep mt-3 h-0.5 overflow-hidden rounded-full"
            aria-hidden
          >
            <div
              className="bg-accent h-full transition-[width] duration-200"
              style={{
                width:
                  (snapshot.duration
                    ? Math.min(
                        100,
                        (snapshot.elapsed / snapshot.duration) * 100,
                      )
                    : 0) + "%",
              }}
            />
          </div>
        )}
        {snapshot.error && (
          <p role="alert" className="text-destructive mt-2 text-xs">
            {snapshot.error}
          </p>
        )}
      </div>
      <AudioPlayerSheet
        open={expanded}
        onClose={() => setExpanded(false)}
        title={title}
      >
        <AudioPlayerExpanded
          title={title}
          url={url}
          author={author}
          imageUrl={imageUrl}
          voiceLabel={snapshot.voice.name}
          currentTime={snapshot.elapsed}
          duration={snapshot.duration}
          isPlaying={snapshot.wantsPlayback}
          playbackSpeed={snapshot.rate}
          onSeek={(time) => controller.seek(time)}
          onTogglePlay={() => controller.toggle()}
          onSelectSpeed={(rate) => controller.setRate(rate)}
          onSkip={(delta) => controller.seek(snapshot.elapsed + delta)}
          onJumpToReadingPosition={jumpToText}
        />
        <div
          className="border-rule mx-5 mb-6 space-y-3 border-t pt-4"
          data-sheet-no-drag
        >
          <label
            htmlFor="listening-voice"
            className="text-foreground block text-sm font-medium"
          >
            Narration voice
          </label>
          <select
            id="listening-voice"
            className="border-rule bg-background text-foreground min-h-11 w-full rounded-xl border px-3 text-sm"
            value={snapshot.voice.id}
            onChange={(event) => {
              const voice = voices.find((v) => v.id === event.target.value);
              if (voice) controller.setVoice(voice);
            }}
          >
            {voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {snapshot.voice.wordTimings
              ? "Highlights follow each word when timing is available."
              : "Highlights follow the current paragraph."}{" "}
            Changing voices restarts the current passage.
          </p>
          {snapshot.estimated && (
            <p className="text-muted-foreground text-xs">
              Duration is estimated until the audio is prepared.
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            Select text in the article and choose “Listen from here” to start at
            that paragraph.
          </p>
        </div>
      </AudioPlayerSheet>
    </>
  );
}
