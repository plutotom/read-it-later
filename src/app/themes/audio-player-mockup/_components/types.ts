export type ExpandedVariant = "classic" | "reader" | "scrub";

export interface MockPlayback {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackSpeed: number;
}

export interface MockArticle {
  title: string;
  domain: string;
  author: string;
  readingTime: number;
}
