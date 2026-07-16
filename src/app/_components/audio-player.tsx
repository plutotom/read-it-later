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
import {
  clearTtsGenerationPending,
  isTtsGenerationPending,
  markTtsGenerationPending,
} from "~/lib/tts-generation-pending";
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
  /** When set, playback-only via public share token (no generation). */
  shareToken?: string;
  /** Scroll article to approximate listen position (0–1). */
  onJumpToReadingPosition?: (progressRatio: number) => void;
  /** Fired when playback starts or pauses (for dock visibility while reading). */
  onPlayingChange?: (isPlaying: boolean) => void;
}

type PlayerState = "idle" | "generating" | "loading" | "ready" | "error";

type PlaybackInfo = {
  audioUrl: string;
  durationSeconds: number;
  currentTimeSeconds: number;
};

const PROGRESS_SAVE_INTERVAL = 5000;
/** Poll server while a generation may still be running after refresh. */
const GENERATION_STATUS_POLL_MS = 3000;

const DOCK_CLASS =
  "rounded-2xl border border-rule bg-surface px-4 py-3 shadow-[var(--shadow-strong)]";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function toPlaybackInfo(data: {
  audioUrl: string;
  durationSeconds: number | null;
  currentTimeSeconds?: number | null;
}): PlaybackInfo {
  return {
    audioUrl: data.audioUrl,
    durationSeconds: data.durationSeconds ?? 0,
    currentTimeSeconds: data.currentTimeSeconds ?? 0,
  };
}

function getLocalPlaybackProgress(articleId: string): number {
  if (typeof window === "undefined") return 0;
  const saved = localStorage.getItem(`tts-progress-${articleId}`);
  if (!saved) return 0;
  const parsed = parseFloat(saved);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function AudioPlayer({
  articleId,
  articleTitle,
  articleUrl,
  articleAuthor,
  articleImageUrl,
  shareToken,
  onJumpToReadingPosition,
  onPlayingChange,
}: AudioPlayerProps) {
  const isPublicShare = Boolean(shareToken);
  const utils = api.useUtils();
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressSaveRef = useRef<NodeJS.Timeout | null>(null);
  /** Avoid re-seeking on every effect re-run (was causing stuck ~0.5s loops). */
  const resumeAppliedForUrlRef = useRef<string | null>(null);

  const [playerState, setPlayerState] = useState<PlayerState>("idle");
  const [playback, setPlayback] = useState<PlaybackInfo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const { data: privateAudioStatus, isLoading: isCheckingPrivateStatus } =
    api.tts.getStatus.useQuery(
      { articleId },
      { enabled: !isPublicShare, refetchOnWindowFocus: false },
    );

  const { data: publicAudioStatus, isLoading: isCheckingPublicStatus } =
    api.tts.getStatusByShareToken.useQuery(
      { shareToken: shareToken ?? "" },
      {
        enabled: isPublicShare,
        refetchOnWindowFocus: false,
        staleTime: Infinity,
      },
    );

  const audioStatus = isPublicShare ? publicAudioStatus : privateAudioStatus;
  const isCheckingStatus = isPublicShare
    ? isCheckingPublicStatus
    : isCheckingPrivateStatus;

  const generateAudioQuery = api.tts.getAudio.useQuery(
    { articleId },
    {
      enabled: false,
      retry: false,
      refetchOnWindowFocus: false,
    },
  );

  const regenerateAudio = api.tts.regenerateAudio.useMutation();
  const updateProgress = api.tts.updateProgress.useMutation();
  const updateProgressRef = useRef(updateProgress.mutateAsync);
  updateProgressRef.current = updateProgress.mutateAsync;
  const { data: voiceConfig } = api.tts.getVoiceConfig.useQuery(undefined, {
    enabled: !isPublicShare,
  });

  const voiceName = voiceConfig?.voiceName ?? DEFAULT_VOICE;
  const voiceLabel = (() => {
    const v = getVoiceOption(voiceName);
    return v ? `Voice · ${v.label}` : null;
  })();

  const audioUrl = playback?.audioUrl;

  useEffect(() => {
    const savedSpeed = localStorage.getItem("tts-playback-speed");
    if (savedSpeed) {
      const speed = parseFloat(savedSpeed);
      if (isPlaybackSpeed(speed)) {
        setPlaybackSpeed(speed);
      }
    }
  }, []);

  // Reset when switching articles
  useEffect(() => {
    setPlayback(null);
    setPlayerState("idle");
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setErrorMessage(null);
    setExpanded(false);
    resumeAppliedForUrlRef.current = null;
    clearTtsGenerationPending(articleId);
  }, [articleId]);

  useEffect(() => {
    onPlayingChange?.(isPlaying);
  }, [isPlaying, onPlayingChange]);

  const savePlaybackProgress = useCallback(
    (timeSeconds: number) => {
      if (isPublicShare) {
        localStorage.setItem(`tts-progress-${articleId}`, String(timeSeconds));
        return;
      }
      void updateProgressRef.current({
        articleId,
        currentTimeSeconds: timeSeconds,
      });
    },
    [articleId, isPublicShare],
  );

  // After refresh: resume "generating" UI if we started before reload
  useEffect(() => {
    if (isPublicShare || isCheckingStatus) return;
    if (audioStatus?.hasAudio) {
      clearTtsGenerationPending(articleId);
      return;
    }
    if (
      isTtsGenerationPending(articleId) &&
      playerState !== "generating" &&
      playerState !== "loading" &&
      playerState !== "ready"
    ) {
      setPlayerState("generating");
    }
  }, [articleId, audioStatus?.hasAudio, isCheckingStatus, playerState]);

  // Poll until background generation writes article_audio
  useEffect(() => {
    if (isPublicShare) return;
    const awaitingServer =
      (playerState === "generating" || isTtsGenerationPending(articleId)) &&
      !audioStatus?.hasAudio;
    if (!awaitingServer) return;

    const interval = setInterval(() => {
      void utils.tts.getStatus.invalidate({ articleId });
    }, GENERATION_STATUS_POLL_MS);

    return () => clearInterval(interval);
  }, [articleId, audioStatus?.hasAudio, isPublicShare, playerState, utils]);

  // Hydrate from server when status loads (skip while generating to avoid races)
  useEffect(() => {
    if (isCheckingStatus) return;
    if (
      !isPublicShare &&
      playerState === "generating" &&
      !audioStatus?.hasAudio
    ) {
      return;
    }

    if (audioStatus?.hasAudio && audioStatus.audio) {
      if (!isPublicShare) {
        clearTtsGenerationPending(articleId);
      }
      const serverUrl = audioStatus.audio.audioUrl;
      if (playback?.audioUrl === serverUrl && playerState === "ready") {
        return;
      }

      const resumeAt = isPublicShare
        ? getLocalPlaybackProgress(articleId)
        : (privateAudioStatus?.audio?.currentTimeSeconds ?? 0);

      const info = toPlaybackInfo({
        audioUrl: serverUrl,
        durationSeconds: audioStatus.audio.durationSeconds,
        currentTimeSeconds: resumeAt,
      });
      setPlayback(info);
      setCurrentTime(info.currentTimeSeconds);
      setDuration(info.durationSeconds);
      setPlayerState((prev) => (prev === "ready" ? "ready" : "loading"));
      return;
    }

    if (!audioStatus?.hasAudio && playerState === "idle") {
      setPlayback(null);
    }
  }, [
    articleId,
    audioStatus,
    isCheckingStatus,
    isPublicShare,
    playerState,
    playback?.audioUrl,
  ]);

  // Attach media listeners and transition loading → ready
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
      audio.playbackRate = playbackSpeed;

      if (resumeAppliedForUrlRef.current !== audioUrl) {
        resumeAppliedForUrlRef.current = audioUrl;
        const resumeAt = playback?.currentTimeSeconds ?? 0;
        if (resumeAt > 0) {
          audio.currentTime = Math.min(resumeAt, audio.duration || resumeAt);
          setCurrentTime(audio.currentTime);
        }
      }

      setPlayerState("ready");
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      savePlaybackProgress(audio.duration);
    };

    const handleError = () => {
      setPlayerState("error");
      setErrorMessage("Failed to load audio. Try generating again.");
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
      handleLoadedMetadata();
    }

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [articleId, audioUrl, playbackSpeed, savePlaybackProgress]);

  useEffect(() => {
    const el = audioRef.current;
    if (el) el.playbackRate = playbackSpeed;
  }, [playbackSpeed, audioUrl]);

  useEffect(() => {
    if (isPlaying) {
      progressSaveRef.current = setInterval(() => {
        const audio = audioRef.current;
        if (audio && !audio.paused) {
          savePlaybackProgress(audio.currentTime);
        }
      }, PROGRESS_SAVE_INTERVAL);
    }
    return () => {
      if (progressSaveRef.current) clearInterval(progressSaveRef.current);
    };
  }, [isPlaying, savePlaybackProgress]);

  const handleGenerateAudio = useCallback(
    async (options?: { regenerate?: boolean }) => {
      if (
        !audioStatus?.hasAudio &&
        (playerState === "generating" || isTtsGenerationPending(articleId))
      ) {
        return;
      }

      markTtsGenerationPending(articleId);
      setPlayerState("generating");
      setErrorMessage(null);
      setIsPlaying(false);

      try {
        let data;
        if (options?.regenerate || audioStatus?.hasAudio) {
          data = await regenerateAudio.mutateAsync({
            articleId,
            voiceName: voiceName,
          });
        } else {
          const result = await generateAudioQuery.refetch();
          if (result.error) {
            throw result.error instanceof Error
              ? result.error
              : new Error("Failed to generate audio");
          }
          if (!result.data) {
            throw new Error("No audio returned from server");
          }
          data = result.data;
        }

        const info = toPlaybackInfo(data);
        setPlayback(info);
        setCurrentTime(info.currentTimeSeconds);
        setDuration(info.durationSeconds);
        clearTtsGenerationPending(articleId);
        setPlayerState("loading");
        void utils.tts.getStatus.invalidate({ articleId });
        void utils.tts.getUsage.invalidate();
      } catch (err) {
        clearTtsGenerationPending(articleId);
        setPlayerState("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to generate audio",
        );
      }
    },
    [
      articleId,
      audioStatus?.hasAudio,
      generateAudioQuery,
      playerState,
      regenerateAudio,
      utils,
      voiceName,
    ],
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
      savePlaybackProgress(audio.currentTime);
    }
  }, [savePlaybackProgress]);

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
  const canExpand = playerState === "ready";
  const isInitialCheck = isCheckingStatus && !playback;
  const generationInFlight =
    !isPublicShare &&
    (playerState === "generating" || isTtsGenerationPending(articleId));

  if (isPublicShare && !isCheckingStatus && !audioStatus?.hasAudio) {
    return null;
  }

  const dock = (() => {
    if (isInitialCheck) {
      return (
        <div className="flex items-center gap-3">
          <div className="bg-background-deep text-muted-foreground flex h-10 w-10 items-center justify-center rounded-full">
            <Loader2 className="size-4 animate-spin" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-foreground truncate text-[13px] font-medium tracking-tight">
              Checking audio
            </div>
            <div className="text-muted-foreground text-[11px]">One moment</div>
          </div>
        </div>
      );
    }

    if (!isPublicShare && playerState === "idle" && !generationInFlight) {
      return (
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void handleGenerateAudio()}
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
      );
    }

    if (
      !isPublicShare &&
      (playerState === "generating" || generationInFlight)
    ) {
      return (
        <div className="flex items-center gap-3">
          <div className="bg-accent text-accent-foreground flex h-10 w-10 items-center justify-center rounded-full">
            <Loader2 className="size-4 animate-spin" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-foreground truncate text-[13px] font-medium tracking-tight">
              Generating audio
            </div>
            <div className="text-muted-foreground text-[11px]">
              May take 1–3 min for long articles. Safe to refresh — we&apos;ll
              pick up when it&apos;s ready.
            </div>
          </div>
          <PlaybackSpeedPicker
            value={playbackSpeed}
            onChange={handleSpeedSelect}
            variant="mini"
            disabled
          />
        </div>
      );
    }

    if (!isPublicShare && playerState === "error") {
      return (
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
            onClick={() => void handleGenerateAudio({ regenerate: true })}
            className="border-rule text-foreground-soft hover:bg-background-deep hover:text-foreground rounded-full border px-3 text-xs"
          >
            Retry
          </Button>
        </div>
      );
    }

    if (isPublicShare && playerState === "error") {
      return null;
    }

    if (playerState === "loading" || !audioUrl) {
      return (
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
      );
    }

    return (
      <>
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
      </>
    );
  })();

  return (
    <>
      {audioUrl ? (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          className="hidden"
          key={audioUrl}
        />
      ) : null}

      <div className={DOCK_CLASS}>{dock}</div>

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
