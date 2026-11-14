/**
 * The library as it stands, and the formats we will take next.
 * Coming formats are the product limit until this file is edited on purpose.
 */
export const COMING_FORMAT_IDS = [
  "pdf-epub",
  "youtube",
  "podcast",
  "academic-paper",
] as const;

export const SHIPPED_CAPABILITY_IDS = [
  "articles",
  "listen",
  "highlights",
  "para",
  "ios-beta",
] as const;

export type ComingFormatId = (typeof COMING_FORMAT_IDS)[number];
export type ShippedCapabilityId = (typeof SHIPPED_CAPABILITY_IDS)[number];

export type ComingFormatStatus = "here" | "underway" | "coming";

export interface ComingFormatStep {
  label: string;
  done: boolean;
}

export interface ComingFormat {
  id: string;
  index: string;
  title: string;
  status: ComingFormatStatus;
  /** What this is in the library. Not how we built it. */
  promise: string;
  /** Short, honest line for the progress rail. */
  stage: string;
  /** Concrete work already done or still ahead. */
  steps: ComingFormatStep[];
}

export const SHIPPED_CAPABILITIES: ComingFormat[] = [
  {
    id: "articles",
    index: "",
    title: "Articles",
    status: "here",
    promise:
      "Save a URL. Read it later in a quiet view, or switch back to the original page.",
    stage: "The library",
    steps: [
      { label: "Save", done: true },
      { label: "Reader", done: true },
      { label: "Web view", done: true },
      { label: "Folders", done: true },
      { label: "Search", done: true },
      { label: "Share", done: true },
    ],
  },
  {
    id: "listen",
    index: "",
    title: "Listen",
    status: "here",
    promise:
      "Hear a saved article while the paragraph keeps up. Same library, different hour.",
    stage: "In the reader",
    steps: [
      { label: "Voices", done: true },
      { label: "Follow along", done: true },
      { label: "Cache", done: true },
    ],
  },
  {
    id: "highlights",
    index: "",
    title: "Highlights",
    status: "here",
    promise:
      "Mark a passage and keep it with the article. Notes and a review list are still open.",
    stage: "Notes still open",
    steps: [
      { label: "Mark", done: true },
      { label: "Colors", done: true },
      { label: "Stay put", done: true },
      { label: "Notes", done: false },
      { label: "Review", done: false },
    ],
  },
  {
    id: "para",
    index: "",
    title: "PARA",
    status: "here",
    promise:
      "Plain text out of the library, into the vault. A document you already finished.",
    stage: "Plain text out",
    steps: [
      { label: "Manifest", done: true },
      { label: "Export", done: true },
      { label: "Keys", done: true },
    ],
  },
  {
    id: "ios-beta",
    index: "",
    title: "iOS beta",
    status: "here",
    promise:
      "The same library on the phone. Internal TestFlight for now; the App Store is still later.",
    stage: "Internal TestFlight",
    steps: [
      { label: "Sign in", done: true },
      { label: "Sync", done: true },
      { label: "Offline", done: true },
      { label: "Notes", done: true },
      { label: "TestFlight", done: true },
      { label: "App Store", done: false },
    ],
  },
];

export const COMING_FORMATS: ComingFormat[] = [
  {
    id: "pdf-epub",
    index: "01",
    title: "PDF & EPUB",
    status: "underway",
    promise:
      "Documents you already have, in the same library as articles. A text layer so they can be searched, listened to, and kept.",
    stage: "Spec and detection",
    steps: [
      { label: "Spec", done: true },
      { label: "Detection", done: true },
      { label: "Viewer", done: false },
      { label: "Text layer", done: false },
      { label: "Highlights", done: false },
    ],
  },
  {
    id: "youtube",
    index: "02",
    title: "YouTube",
    status: "coming",
    promise:
      "Talks you saved instead of watching. They should still become something you can read, highlight, and return to.",
    stage: "Not started",
    steps: [],
  },
  {
    id: "podcast",
    index: "03",
    title: "Podcasts",
    status: "coming",
    promise:
      "Episodes worth keeping after the audio fades. A document in the library — not a second player.",
    stage: "Not started",
    steps: [],
  },
  {
    id: "academic-paper",
    index: "04",
    title: "Academic papers",
    status: "coming",
    promise:
      "Papers with the same inbox, highlights, and search as everything else you meant to finish.",
    stage: "Not started",
    steps: [],
  },
];

export const COMING_FORMAT_STATUS_LABEL: Record<ComingFormatStatus, string> = {
  here: "Here",
  underway: "Underway",
  coming: "Coming",
};

export function comingFormatDoneCount(format: ComingFormat): number {
  return format.steps.filter((step) => step.done).length;
}

export function comingFormatProgress(format: ComingFormat): number {
  if (format.steps.length === 0) {
    return format.status === "coming" ? 0 : 100;
  }
  return Math.round(
    (100 * comingFormatDoneCount(format)) / format.steps.length,
  );
}

export function comingFormatsInMotion(): number {
  return COMING_FORMATS.filter((format) => format.status === "underway").length;
}
