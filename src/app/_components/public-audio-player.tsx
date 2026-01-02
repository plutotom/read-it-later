/**
 * Public Audio Player Component
 * Simplified audio player for public viewing (playback only, no generation)
 */

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "~/trpc/react";
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Headphones,
  Loader2,
  Volume2,
  Volume1,
  VolumeX,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

interface PublicAudioPlayerProps {
  shareToken: string;
  articleId: string;
}

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const PROGRESS_SAVE_INTERVAL = 5000; // Save progress every 5 seconds

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function PublicAudioPlayer({ shareToken, articleId }: PublicAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressSaveRef = useRef<NodeJS.Timeout | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if audio exists for this shared article
  const { data: audioStatus, isLoading } =
    api.tts.getStatusByShareToken.useQuery(
      { shareToken },
      {
        refetchOnWindowFocus: false,
        staleTime: Infinity,
      }
    );

  const handleLoadedMetadata = useCallback((e: React.SyntheticEvent<HTMLAudioElement, Event>) => {
    const audio = e.currentTarget;
    if (!isFinite(audio.duration)) return;
    setDuration(audio.duration);
    audio.playbackRate = playbackSpeed;
    // Restore saved position from localStorage
    const savedProgress = localStorage.getItem(`tts-progress-${articleId}`);
    if (savedProgress) {
      const savedTime = parseFloat(savedProgress);
      if (!isNaN(savedTime) && savedTime < audio.duration) {
        audio.currentTime = savedTime;
        setCurrentTime(savedTime);
      }
    }
    setIsLoaded(true);
    setError(null);
  }, [playbackSpeed, articleId]);

  const handleTimeUpdate = useCallback((e: React.SyntheticEvent<HTMLAudioElement, Event>) => {
    setCurrentTime(e.currentTarget.currentTime);
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleError = useCallback(() => {
    setIsLoaded(true);
    setError("Failed to load audio");
  }, []);

  // Update playback speed when it changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Periodic progress saving to localStorage
  useEffect(() => {
    if (isPlaying && articleId) {
      progressSaveRef.current = setInterval(() => {
        const audio = audioRef.current;
        if (audio && !audio.paused) {
          localStorage.setItem(`tts-progress-${articleId}`, String(audio.currentTime));
        }
      }, PROGRESS_SAVE_INTERVAL);
    }

    return () => {
      if (progressSaveRef.current) {
        clearInterval(progressSaveRef.current);
      }
    };
  }, [isPlaying, articleId]);

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
      localStorage.setItem(`tts-progress-${articleId}`, String(audio.currentTime));
    }
  }, [articleId]);

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

  // Check for cached audio state on mount/update
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && audio.readyState >= 1 && isFinite(audio.duration)) {
      setDuration(audio.duration);
      setIsLoaded(true);
    }
  }, [audioStatus?.audio?.audioUrl]);

  // If loading, show nothing
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800/50 p-3">
        <Loader2 className="size-5 animate-spin text-gray-400" />
        <span className="text-sm text-gray-300">Loading audio...</span>
      </div>
    );
  }

  // If no audio exists, don't show anything
  if (!audioStatus?.hasAudio || !audioStatus.audio) {
    return null;
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-3">
      <audio
        ref={audioRef}
        key={audioStatus.audio.audioUrl}
        src={audioStatus.audio.audioUrl}
        preload="auto"
        onLoadedMetadata={handleLoadedMetadata}
        onCanPlay={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleError}
      />

      {error ? (
        <div className="flex items-center gap-3 text-red-400">
           <VolumeX className="size-5" />
           <span className="text-sm">{error}</span>
        </div>
      ) : !isLoaded ? (
        <div className="flex items-center gap-3">
          <Headphones className="size-5 text-gray-400" />
          <span className="flex-1 text-sm text-gray-300">Listen to this article</span>
          <Loader2 className="size-4 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
