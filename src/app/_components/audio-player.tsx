/**
 * Audio Player Component
 * Lo-fi TTS audio player for articles with playback controls
 */

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import {
  Play,
  Pause,
  Headphones,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { DEFAULT_VOICE } from "~/lib/tts-voices";

interface AudioPlayerProps {
  articleId: string;
}

type PlayerState = "idle" | "generating" | "loading" | "ready" | "error";

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const PROGRESS_SAVE_INTERVAL = 5000; // Save progress every 5 seconds

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ articleId }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressSaveRef = useRef<NodeJS.Timeout | null>(null);

  const [playerState, setPlayerState] = useState<PlayerState>("idle");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check if audio already exists
  const { data: audioStatus, isLoading: isCheckingStatus } =
    api.tts.getStatus.useQuery(
      { articleId },
      {
        refetchOnWindowFocus: false,
        staleTime: Infinity,
      },
    );

  // Generate audio mutation
  const generateAudio = api.tts.getAudio.useQuery(
    { articleId },
    {
      enabled: false, // Only fetch when explicitly called
      refetchOnWindowFocus: false,
    },
  );

  // Regenerate audio mutation (for voice override)
  const regenerateAudio = api.tts.regenerateAudio.useMutation();

  // Update progress mutation
  const updateProgress = api.tts.updateProgress.useMutation();

  const { data: voiceConfig } = api.tts.getVoiceConfig.useQuery();

  // Load saved playback speed from localStorage
  useEffect(() => {
    const savedSpeed = localStorage.getItem("tts-playback-speed");
    if (savedSpeed) {
      const speed = parseFloat(savedSpeed);
      if (PLAYBACK_SPEEDS.includes(speed as (typeof PLAYBACK_SPEEDS)[number])) {
        setPlaybackSpeed(speed);
      }
    }
  }, []);

  // Set initial state based on audio status
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

  // Handle audio loading
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      audio.playbackRate = playbackSpeed;
      // Restore saved position
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
      // Save final position
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

  // Periodic progress saving
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
      if (progressSaveRef.current) {
        clearInterval(progressSaveRef.current);
      }
    };
  }, [isPlaying, articleId, updateProgress]);

  const handleGenerateAudio = useCallback(
    async (voiceOverride?: string) => {
      setPlayerState("generating");
      setErrorMessage(null);
      try {
        if (voiceOverride) {
          // Use regenerate mutation for specific voice
          const result = await regenerateAudio.mutateAsync({
            articleId,
            voiceName: voiceOverride,
          });
          if (result) {
            setPlayerState("loading");
            setDuration(result.durationSeconds ?? 0);
          }
        } else {
          // Use default query for user's preference
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
      // Save progress on pause
      void updateProgress.mutateAsync({
        articleId,
        currentTimeSeconds: audio.currentTime,
      });
    }
  }, [articleId, updateProgress]);

  const handleSpeedCycle = useCallback(() => {
    const index = PLAYBACK_SPEEDS.indexOf(
      playbackSpeed as (typeof PLAYBACK_SPEEDS)[number],
    );
    const next = PLAYBACK_SPEEDS[(index + 1) % PLAYBACK_SPEEDS.length] ?? 1;
    setPlaybackSpeed(next);
    localStorage.setItem("tts-playback-speed", String(next));
    if (audioRef.current) {
      audioRef.current.playbackRate = next;
    }
  }, [playbackSpeed]);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = x / rect.width;
      audio.currentTime = percentage * duration;
    },
    [duration],
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const audioUrl = audioStatus?.audio?.audioUrl ?? generateAudio.data?.audioUrl;

  if (playerState === "idle" && !isCheckingStatus) {
    return (
      <div className="rounded-2xl border border-rule bg-surface px-4 py-3 shadow-[var(--shadow-strong)]">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleGenerateAudio(voiceConfig?.voiceName ?? DEFAULT_VOICE)}
            className="h-10 w-10 rounded-full bg-accent text-accent-foreground hover:bg-accent/90 hover:text-accent-foreground"
          >
            <Headphones className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium tracking-tight text-foreground">
              Generate narration
            </div>
            <div className="text-[11px] text-muted-foreground">
              Listen in Matter mode
            </div>
          </div>
          <span className="rounded-full border border-rule px-3 py-1 text-xs text-foreground-soft">
            {playbackSpeed}x
          </span>
        </div>
      </div>
    );
  }

  if (playerState === "generating") {
    return (
      <div className="rounded-2xl border border-rule bg-surface px-4 py-3 shadow-[var(--shadow-strong)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium tracking-tight text-foreground">
              Generating audio
            </div>
            <div className="text-[11px] text-muted-foreground">
              This may take a moment
            </div>
          </div>
          <span className="rounded-full border border-rule px-3 py-1 text-xs text-foreground-soft">
            {playbackSpeed}x
          </span>
        </div>
      </div>
    );
  }

  if (playerState === "error") {
    return (
      <div className="rounded-2xl border border-rule bg-surface px-4 py-3 shadow-[var(--shadow-strong)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background-deep text-muted-foreground">
            <AlertCircle className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium tracking-tight text-foreground">
              Audio unavailable
            </div>
            <div className="text-[11px] text-muted-foreground">
              {errorMessage ?? "Something went wrong"}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleGenerateAudio(voiceConfig?.voiceName ?? DEFAULT_VOICE)}
            className="rounded-full border border-rule px-3 text-xs text-foreground-soft hover:bg-background-deep hover:text-foreground"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (isCheckingStatus || (playerState === "loading" && !audioUrl)) {
    return (
      <div className="rounded-2xl border border-rule bg-surface px-4 py-3 shadow-[var(--shadow-strong)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background-deep text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium tracking-tight text-foreground">
              Loading audio
            </div>
            <div className="text-[11px] text-muted-foreground">
              Preparing your narration
            </div>
          </div>
          <span className="rounded-full border border-rule px-3 py-1 text-xs text-foreground-soft">
            {playbackSpeed}x
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-rule bg-surface px-4 py-3 shadow-[var(--shadow-strong)]">
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}

      <div
        className="mb-3 h-1.5 cursor-pointer rounded-full bg-background-deep"
        onClick={handleSeek}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePlayPause}
          className={`h-10 w-10 rounded-full bg-accent text-accent-foreground hover:bg-accent/90 hover:text-accent-foreground ${isPlaying ? "m-pulse" : ""}`}
          disabled={playerState !== "ready"}
        >
          {isPlaying ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
        </Button>

        {isPlaying ? (
          <div className="flex items-end gap-0.5" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="m-bar w-0.5 rounded-sm bg-accent"
                style={{ height: 18, animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
        ) : (
          <div className="h-4 w-2 shrink-0" />
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium tracking-tight text-foreground">
            Article narration
          </div>
          <div className="text-[11px] text-muted-foreground">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleSpeedCycle}
          className="rounded-full border border-rule px-3 text-xs text-foreground-soft hover:bg-background-deep hover:text-foreground"
        >
          {playbackSpeed}x
        </Button>
      </div>
    </div>
  );
}
