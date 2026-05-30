/**
 * Audio Player Component
 * Lo-fi TTS audio player for articles with playback controls
 */

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Play, Pause, Headphones, Loader2, AlertCircle } from "lucide-react";
import { DEFAULT_VOICE, getVoiceOption } from "~/lib/tts-voices";
import { isPlaybackSpeed } from "~/lib/playback-speed";
import { cn } from "~/lib/utils";
import { AudioPlayerExpanded } from "./audio-player-expanded";
import { AudioPlayerSheet } from "./audio-player-sheet";
import { PlaybackSpeedPicker } from "./playback-speed-picker";

interface AudioPlayerProps {
  articleId: string;
  articleTitle: string;
  articleUrl: string;
  articleAuthor?: string | null;
  articleImageUrl?: string | null;
  /** Scroll article to approximate listen position (0–1). */
  onJumpToReadingPosition?: (progressRatio: number) => void;
}

type PlayerState = "idle" | "generating" | "loading" | "ready" | "error";

const PROGRESS_SAVE_INTERVAL = 5000;

const DOCK_CLASS =
  "rounded-2xl border border-rule bg-surface px-4 py-3 shadow-[var(--shadow-strong)]";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function AudioPlayer({
  articleId,
  articleTitle,
  articleUrl,
  articleAuthor,
  articleImageUrl,
  onJumpToReadingPosition,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressSaveRef = useRef<NodeJS.Timeout | null>(null);

  const [playerState, setPlayerState] = useState<PlayerState>("idle");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const { data: audioStatus, isLoading: isCheckingStatus } =
    api.tts.getStatus.useQuery(
      { articleId },
      { refetchOnWindowFocus: false, staleTime: Infinity },
    );

  const generateAudio = api.tts.getAudio.useQuery(
    { articleId },
    { enabled: false, refetchOnWindowFocus: false },
  );

  const regenerateAudio = api.tts.regenerateAudio.useMutation();
  const updateProgress = api.tts.updateProgress.useMutation();
  const { data: voiceConfig } = api.tts.getVoiceConfig.useQuery();

  const voiceName = voiceConfig?.voiceName ?? DEFAULT_VOICE;
  const voiceLabel = (() => {
    const v = getVoiceOption(voiceName);
    return v ? `Voice · ${v.label}` : null;
  })();

  useEffect(() => {
    const savedSpeed = localStorage.getItem("tts-playback-speed");
    if (savedSpeed) {
      const speed = parseFloat(savedSpeed);
      if (isPlaybackSpeed(speed)) {
        setPlaybackSpeed(speed);
      }
    }
  }, []);

  useEffect(() => {
    if (!isCheckingStatus && audioStatus) {
      if (audioStatus.hasAudio && audioStatus.audio) {
        setPlayerState("loading");
        setCurrentTime(audioStatus.audio.currentTimeSeconds ?? 0);
        if (audioStatus.audio.durationSeconds) {
          setDuration(audioStatus.audio.durationSeconds);
        }
      } else {
        setPlayerState("idle");
      }
    }
  }, [audioStatus, isCheckingStatus]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      audio.playbackRate = playbackSpeed;
      if (audioStatus?.audio?.currentTimeSeconds) {
        audio.currentTime = audioStatus.audio.currentTimeSeconds;
      }
      setPlayerState("ready");
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      void updateProgress.mutateAsync({
        articleId,
        currentTimeSeconds: audio.duration,
      });
    };

    const handleError = () => {
      setPlayerState("error");
      setErrorMessage("Failed to load audio");
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [
    articleId,
    audioStatus?.audio?.currentTimeSeconds,
    playbackSpeed,
    updateProgress,
  ]);

  useEffect(() => {
    if (isPlaying) {
      progressSaveRef.current = setInterval(() => {
        const audio = audioRef.current;
        if (audio && !audio.paused) {
          void updateProgress.mutateAsync({
            articleId,
            currentTimeSeconds: audio.currentTime,
          });
        }
      }, PROGRESS_SAVE_INTERVAL);
    }
    return () => {
      if (progressSaveRef.current) clearInterval(progressSaveRef.current);
    };
  }, [isPlaying, articleId, updateProgress]);

  const handleGenerateAudio = useCallback(
    async (voiceOverride?: string) => {
      setPlayerState("generating");
      setErrorMessage(null);
      try {
        if (voiceOverride) {
          const result = await regenerateAudio.mutateAsync({
            articleId,
            voiceName: voiceOverride,
          });
          if (result) {
            setPlayerState("loading");
            setDuration(result.durationSeconds ?? 0);
          }
        } else {
          const result = await generateAudio.refetch();
          if (result.data) {
            setPlayerState("loading");
            setDuration(result.data.durationSeconds ?? 0);
          } else if (result.error) {
            setPlayerState("error");
            setErrorMessage(result.error.message);
          }
        }
      } catch (err) {
        setPlayerState("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to generate audio",
        );
      }
    },
    [generateAudio, regenerateAudio, articleId],
  );

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      void audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
      void updateProgress.mutateAsync({
        articleId,
        currentTimeSeconds: audio.currentTime,
      });
    }
  }, [articleId, updateProgress]);

  const handleSpeedSelect = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
    localStorage.setItem("tts-playback-speed", String(speed));
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, []);

  const seekToTime = useCallback(
    (time: number) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;
      const clamped = Math.max(0, Math.min(duration, time));
      audio.currentTime = clamped;
      setCurrentTime(clamped);
    },
    [duration],
  );

  const handleMiniSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      const audio = audioRef.current;
      if (!audio || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = x / rect.width;
      seekToTime(percentage * duration);
    },
    [duration, seekToTime],
  );

  const skip = useCallback(
    (deltaSeconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      seekToTime(audio.currentTime + deltaSeconds);
    },
    [seekToTime],
  );

  const openExpanded = useCallback(() => {
    if (playerState === "ready") setExpanded(true);
  }, [playerState]);

  const handleJumpToReadingPosition = useCallback(() => {
    if (!onJumpToReadingPosition || duration <= 0) return;
    onJumpToReadingPosition(currentTime / duration);
    setExpanded(false);
  }, [onJumpToReadingPosition, currentTime, duration]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const audioUrl = audioStatus?.audio?.audioUrl ?? generateAudio.data?.audioUrl;
  const canExpand = playerState === "ready";

  if (playerState === "idle" && !isCheckingStatus) {
    return (
      <div className={DOCK_CLASS}>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleGenerateAudio(voiceName)}
            className="bg-accent text-accent-foreground hover:bg-accent/90 hover:text-accent-foreground h-10 w-10 rounded-full"
          >
            <Headphones className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="text-foreground truncate text-[13px] font-medium tracking-tight">
              Generate narration
            </div>
            <div className="text-muted-foreground text-[11px]">
              Listen in Matter mode
            </div>
          </div>
          <PlaybackSpeedPicker
            value={playbackSpeed}
            onChange={handleSpeedSelect}
            variant="mini"
          />
        </div>
      </div>
    );
  }

  if (playerState === "generating") {
    return (
      <div className={DOCK_CLASS}>
        <div className="flex items-center gap-3">
          <div className="bg-accent text-accent-foreground flex h-10 w-10 items-center justify-center rounded-full">
            <Loader2 className="size-4 animate-spin" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-foreground truncate text-[13px] font-medium tracking-tight">
              Generating audio
            </div>
            <div className="text-muted-foreground text-[11px]">
              This may take a moment
            </div>
          </div>
          <PlaybackSpeedPicker
            value={playbackSpeed}
            onChange={handleSpeedSelect}
            variant="mini"
            disabled
          />
        </div>
      </div>
    );
  }

  if (playerState === "error") {
    return (
      <div className={DOCK_CLASS}>
        <div className="flex items-center gap-3">
          <div className="bg-background-deep text-muted-foreground flex h-10 w-10 items-center justify-center rounded-full">
            <AlertCircle className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-foreground truncate text-[13px] font-medium tracking-tight">
              Audio unavailable
            </div>
            <div className="text-muted-foreground text-[11px]">
              {errorMessage ?? "Something went wrong"}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleGenerateAudio(voiceName)}
            className="border-rule text-foreground-soft hover:bg-background-deep hover:text-foreground rounded-full border px-3 text-xs"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (isCheckingStatus || (playerState === "loading" && !audioUrl)) {
    return (
      <div className={DOCK_CLASS}>
        <div className="flex items-center gap-3">
          <div className="bg-background-deep text-muted-foreground flex h-10 w-10 items-center justify-center rounded-full">
            <Loader2 className="size-4 animate-spin" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-foreground truncate text-[13px] font-medium tracking-tight">
              Loading audio
            </div>
            <div className="text-muted-foreground text-[11px]">
              Preparing your narration
            </div>
          </div>
          <PlaybackSpeedPicker
            value={playbackSpeed}
            onChange={handleSpeedSelect}
            variant="mini"
            disabled
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={DOCK_CLASS}>
        {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}

        <div
          className={cn(
            "bg-background-deep mb-3 h-1.5 rounded-full",
            canExpand ? "cursor-pointer" : "",
          )}
          onClick={handleMiniSeek}
          role="presentation"
        >
          <div
            className="bg-accent h-full rounded-full transition-[width] duration-150 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              togglePlayPause();
            }}
            className={cn(
              "bg-accent text-accent-foreground hover:bg-accent/90 hover:text-accent-foreground h-10 w-10 shrink-0 rounded-full",
              isPlaying && "m-pulse",
            )}
            disabled={playerState !== "ready"}
          >
            {isPlaying ? (
              <Pause className="size-4" />
            ) : (
              <Play className="ml-0.5 size-4" />
            )}
          </Button>

          {isPlaying ? (
            <div className="flex items-end gap-0.5" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="m-bar bg-accent w-0.5 rounded-sm"
                  style={{ height: 18, animationDelay: `${i * 120}ms` }}
                />
              ))}
            </div>
          ) : (
            <div className="h-4 w-2 shrink-0" />
          )}

          <button
            type="button"
            onClick={openExpanded}
            disabled={!canExpand}
            className="min-w-0 flex-1 text-left disabled:cursor-default"
            aria-label="Open expanded player"
          >
            <div className="text-foreground truncate text-[13px] font-medium tracking-tight">
              {articleTitle}
            </div>
            <div className="text-muted-foreground text-[11px]">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </button>

          <PlaybackSpeedPicker
            value={playbackSpeed}
            onChange={handleSpeedSelect}
            variant="mini"
            disabled={playerState !== "ready"}
          />
        </div>
      </div>

      <AudioPlayerSheet
        open={expanded}
        onClose={() => setExpanded(false)}
        title={`Now playing: ${articleTitle}`}
      >
        <AudioPlayerExpanded
          title={articleTitle}
          url={articleUrl}
          author={articleAuthor}
          imageUrl={articleImageUrl}
          voiceLabel={voiceLabel}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          playbackSpeed={playbackSpeed}
          disabled={playerState !== "ready"}
          onSeek={seekToTime}
          onTogglePlay={togglePlayPause}
          onSelectSpeed={handleSpeedSelect}
          onSkip={skip}
          onJumpToReadingPosition={
            onJumpToReadingPosition ? handleJumpToReadingPosition : undefined
          }
        />
      </AudioPlayerSheet>
    </>
  );
}
