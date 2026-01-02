/**
 * Audio Player Component
 * Lo-fi TTS audio player for articles with playback controls
 */

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Headphones,
  Loader2,
  AlertCircle,
  Volume2,
  Volume1,
  VolumeX,
} from "lucide-react";


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
  const [volume, setVolume] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check if audio already exists
  const { data: audioStatus, isLoading: isCheckingStatus } =
    api.tts.getStatus.useQuery(
      { articleId },
      {
        refetchOnWindowFocus: false,
        staleTime: Infinity,
      }
    );

  // Generate audio mutation
  const generateAudio = api.tts.getAudio.useQuery(
    { articleId },
    {
      enabled: false, // Only fetch when explicitly called
      refetchOnWindowFocus: false,
    }
  );

  // Update progress mutation
  const updateProgress = api.tts.updateProgress.useMutation();

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
  }, [articleId, audioStatus?.audio?.currentTimeSeconds, playbackSpeed, updateProgress]);

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

  // Handle generate audio
  const handleGenerateAudio = useCallback(async () => {
    setPlayerState("generating");
    setErrorMessage(null);
    try {
      const result = await generateAudio.refetch();
      if (result.data) {
        setPlayerState("loading");
        setDuration(result.data.durationSeconds ?? 0);
      } else if (result.error) {
        setPlayerState("error");
        setErrorMessage(result.error.message);
      }
    } catch {
      setPlayerState("error");
      setErrorMessage("Failed to generate audio");
    }
  }, [generateAudio]);

  // Play/Pause toggle
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

  // Skip forward/backward
  const skip = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds));
  }, []);

  // Handle speed change
  const handleSpeedChange = useCallback((value: string) => {
    const speed = parseFloat(value);
    setPlaybackSpeed(speed);
    localStorage.setItem("tts-playback-speed", value);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, []);

  // Handle volume change
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  }, []);

  // Handle seeking via progress bar
  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    audio.currentTime = percentage * duration;
  }, [duration]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const audioUrl = audioStatus?.audio?.audioUrl ?? generateAudio.data?.audioUrl;

  // Idle state - show generate button
  if (playerState === "idle" && !isCheckingStatus) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800/50 p-3">
        <Headphones className="size-5 text-gray-400" />
        <span className="flex-1 text-sm text-gray-300">Listen to this article</span>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleGenerateAudio}
          className="gap-2"
        >
          <Volume2 className="size-4" />
          Generate Audio
        </Button>
      </div>
    );
  }

  // Generating state
  if (playerState === "generating") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800/50 p-3">
        <Loader2 className="size-5 animate-spin text-blue-400" />
        <span className="text-sm text-gray-300">Generating audio... This may take a moment</span>
      </div>
    );
  }

  // Error state
  if (playerState === "error") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-red-900/50 bg-red-950/30 p-3">
        <AlertCircle className="size-5 text-red-400" />
        <span className="flex-1 text-sm text-red-300">{errorMessage ?? "Something went wrong"}</span>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleGenerateAudio}
          className="gap-2"
        >
          Retry
        </Button>
      </div>
    );
  }

  // Loading or checking state
  if (isCheckingStatus || playerState === "loading" && !audioUrl) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800/50 p-3">
        <Loader2 className="size-5 animate-spin text-gray-400" />
        <span className="text-sm text-gray-300">Loading audio...</span>
      </div>
    );
  }

  // Ready state - full player
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-3">
      {audioUrl && (
        <audio ref={audioRef} src={audioUrl} preload="metadata" />
      )}

      {/* Progress bar */}
      <div
        className="group mb-3 h-2 cursor-pointer rounded-full bg-gray-700"
        onClick={handleSeek}
      >
        <div
          className="h-full rounded-full bg-linear-to-r from-blue-500 to-blue-400 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {/* Skip back */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => skip(-10)}
          className="size-8 text-gray-400 hover:text-white"
          title="Back 10 seconds"
        >
          <RotateCcw className="size-4" />
        </Button>

        {/* Play/Pause */}
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePlayPause}
          className="size-10 text-white"
          disabled={playerState !== "ready"}
        >
          {isPlaying ? (
            <Pause className="size-5" />
          ) : (
            <Play className="size-5 ml-0.5" />
          )}
        </Button>

        {/* Skip forward */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => skip(30)}
          className="size-8 text-gray-400 hover:text-white"
          title="Forward 30 seconds"
        >
          <RotateCw className="size-4" />
        </Button>

        {/* Time display */}
        <div className="ml-2 flex-1 text-xs text-gray-400">
          <span className="font-mono">{formatTime(currentTime)}</span>
          <span className="mx-1">/</span>
          <span className="font-mono">{formatTime(duration)}</span>
        </div>

        {/* Volume control */}
        <div className="flex items-center gap-1">
          {volume === 0 ? (
            <VolumeX className="size-4 text-gray-400" />
          ) : volume < 0.5 ? (
            <Volume1 className="size-4 text-gray-400" />
          ) : (
            <Volume2 className="size-4 text-gray-400" />
          )}
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={handleVolumeChange}
            className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-gray-600 accent-blue-500"
            title={`Volume: ${Math.round(volume * 100)}%`}
          />
        </div>

        {/* Speed selector */}
        <Select value={String(playbackSpeed)} onValueChange={handleSpeedChange}>
          <SelectTrigger className="h-7 w-16 border-gray-600 bg-gray-700/50 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLAYBACK_SPEEDS.map((speed) => (
              <SelectItem key={speed} value={String(speed)}>
                {speed}x
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
