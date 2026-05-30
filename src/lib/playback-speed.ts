export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

/** Fastest first — matches Apple Podcasts speed menu order. */
export const PLAYBACK_SPEEDS_DESCENDING = [...PLAYBACK_SPEEDS].reverse();

export function formatPlaybackSpeed(speed: number): string {
  return `${speed}x`;
}

export function isPlaybackSpeed(speed: number): speed is PlaybackSpeed {
  return PLAYBACK_SPEEDS.includes(speed as PlaybackSpeed);
}
