/**
 * TTS Voice Options
 * Available Google Cloud TTS voices for user selection
 */

export type VoiceTier =
  | "standard"
  | "wavenet"
  | "neural2"
  | "chirp3"
  | "studio";

export interface TTSVoiceOption {
  name: string;
  label: string;
  description: string;
  gender: "male" | "female";
  tier: VoiceTier;
  priceMultiplier: number; // 1x = base price, 4x = 4 times the cost
}

/**
 * Voice tier display info
 */
export const VOICE_TIER_INFO: Record<
  VoiceTier,
  { label: string; description: string }
> = {
  standard: {
    label: "Standard",
    description: "Basic quality, most affordable",
  },
  wavenet: {
    label: "WaveNet",
    description: "Neural network, natural sounding",
  },
  neural2: { label: "Neural2", description: "Latest AI, most natural" },
  chirp3: {
    label: "Chirp 3 HD",
    description: "Natural narration with pause markup",
  },
  studio: {
    label: "Studio",
    description: "Highest quality, professional narration",
  },
};

/**
 * All available voice options with pricing
 * Standard: 1x ($4/1M chars), WaveNet/Neural2: 4x ($16/1M chars),
 * Chirp 3 HD: 8x ($30/1M chars), Studio: 16x ($160/1M chars)
 */
export const TTS_VOICE_OPTIONS: TTSVoiceOption[] = [
  // Chirp 3 HD voices (8x price, natural narration + pause markup)
  {
    name: "en-US-Chirp3-HD-Charon",
    label: "Charon",
    description: "Male, US",
    gender: "male",
    tier: "chirp3",
    priceMultiplier: 8,
  },
  {
    name: "en-US-Chirp3-HD-Kore",
    label: "Kore",
    description: "Female, US",
    gender: "female",
    tier: "chirp3",
    priceMultiplier: 8,
  },
  {
    name: "en-US-Chirp3-HD-Leda",
    label: "Leda",
    description: "Female, US",
    gender: "female",
    tier: "chirp3",
    priceMultiplier: 8,
  },
  {
    name: "en-US-Chirp3-HD-Aoede",
    label: "Aoede",
    description: "Female, US",
    gender: "female",
    tier: "chirp3",
    priceMultiplier: 8,
  },
  {
    name: "en-US-Chirp3-HD-Puck",
    label: "Puck",
    description: "Male, US",
    gender: "male",
    tier: "chirp3",
    priceMultiplier: 8,
  },
  {
    name: "en-US-Chirp3-HD-Zephyr",
    label: "Zephyr",
    description: "Female, US",
    gender: "female",
    tier: "chirp3",
    priceMultiplier: 8,
  },
  {
    name: "en-US-Chirp3-HD-Fenrir",
    label: "Fenrir",
    description: "Male, US",
    gender: "male",
    tier: "chirp3",
    priceMultiplier: 8,
  },
  {
    name: "en-US-Chirp3-HD-Despina",
    label: "Despina",
    description: "Female, US",
    gender: "female",
    tier: "chirp3",
    priceMultiplier: 8,
  },

  // Standard voices (1x price)
  {
    name: "en-US-Standard-A",
    label: "Alex",
    description: "Male, US",
    gender: "male",
    tier: "standard",
    priceMultiplier: 1,
  },
  {
    name: "en-US-Standard-B",
    label: "Brian",
    description: "Male, US",
    gender: "male",
    tier: "standard",
    priceMultiplier: 1,
  },
  {
    name: "en-US-Standard-C",
    label: "Carol",
    description: "Female, US",
    gender: "female",
    tier: "standard",
    priceMultiplier: 1,
  },
  {
    name: "en-US-Standard-D",
    label: "David",
    description: "Male, US",
    gender: "male",
    tier: "standard",
    priceMultiplier: 1,
  },
  {
    name: "en-US-Standard-E",
    label: "Emma",
    description: "Female, US",
    gender: "female",
    tier: "standard",
    priceMultiplier: 1,
  },
  {
    name: "en-US-Standard-F",
    label: "Fiona",
    description: "Female, US",
    gender: "female",
    tier: "standard",
    priceMultiplier: 1,
  },

  // WaveNet voices (4x price, better quality)
  {
    name: "en-US-Wavenet-A",
    label: "Ava",
    description: "Male, US",
    gender: "male",
    tier: "wavenet",
    priceMultiplier: 4,
  },
  {
    name: "en-US-Wavenet-B",
    label: "Blake",
    description: "Male, US",
    gender: "male",
    tier: "wavenet",
    priceMultiplier: 4,
  },
  {
    name: "en-US-Wavenet-C",
    label: "Chloe",
    description: "Female, US",
    gender: "female",
    tier: "wavenet",
    priceMultiplier: 4,
  },
  {
    name: "en-US-Wavenet-D",
    label: "Dylan",
    description: "Male, US",
    gender: "male",
    tier: "wavenet",
    priceMultiplier: 4,
  },
  {
    name: "en-US-Wavenet-E",
    label: "Ella",
    description: "Female, US",
    gender: "female",
    tier: "wavenet",
    priceMultiplier: 4,
  },
  {
    name: "en-US-Wavenet-F",
    label: "Faith",
    description: "Female, US",
    gender: "female",
    tier: "wavenet",
    priceMultiplier: 4,
  },

  // Neural2 voices (4x price, best quality)
  {
    name: "en-US-Neural2-A",
    label: "Aurora",
    description: "Male, US",
    gender: "male",
    tier: "neural2",
    priceMultiplier: 4,
  },
  {
    name: "en-US-Neural2-C",
    label: "Claire",
    description: "Female, US",
    gender: "female",
    tier: "neural2",
    priceMultiplier: 4,
  },
  {
    name: "en-US-Neural2-D",
    label: "Derek",
    description: "Male, US",
    gender: "male",
    tier: "neural2",
    priceMultiplier: 4,
  },
  {
    name: "en-US-Neural2-E",
    label: "Eva",
    description: "Female, US",
    gender: "female",
    tier: "neural2",
    priceMultiplier: 4,
  },
  {
    name: "en-US-Neural2-F",
    label: "Freya",
    description: "Female, US",
    gender: "female",
    tier: "neural2",
    priceMultiplier: 4,
  },
  {
    name: "en-US-Neural2-G",
    label: "Grace",
    description: "Female, US",
    gender: "female",
    tier: "neural2",
    priceMultiplier: 4,
  },
  {
    name: "en-US-Neural2-H",
    label: "Harper",
    description: "Female, US",
    gender: "female",
    tier: "neural2",
    priceMultiplier: 4,
  },
  {
    name: "en-US-Neural2-I",
    label: "Isaac",
    description: "Male, US",
    gender: "male",
    tier: "neural2",
    priceMultiplier: 4,
  },
  {
    name: "en-US-Neural2-J",
    label: "Jade",
    description: "Male, US",
    gender: "male",
    tier: "neural2",
    priceMultiplier: 4,
  },

  // Studio voices (16x price, professional quality)
  {
    name: "en-US-Studio-O",
    label: "Oliver",
    description: "Male, US",
    gender: "male",
    tier: "studio",
    priceMultiplier: 16,
  },
  {
    name: "en-US-Studio-Q",
    label: "Quinn",
    description: "Male, US",
    gender: "male",
    tier: "studio",
    priceMultiplier: 16,
  },
];

export const DEFAULT_VOICE = "en-US-Chirp3-HD-Charon";

/** Monthly free tier expressed as standard-equivalent characters */
export const TTS_FREE_TIER_LIMIT = 4_000_000;

const TIER_MULTIPLIERS: Record<VoiceTier, number> = {
  standard: 1,
  wavenet: 4,
  neural2: 4,
  chirp3: 8,
  studio: 16,
};

/**
 * Get voice option by name
 */
export function getVoiceOption(name: string): TTSVoiceOption | undefined {
  return TTS_VOICE_OPTIONS.find((v) => v.name === name);
}

/**
 * Infer voice tier from a voice name (falls back to standard for unknown voices)
 */
export function getVoiceTier(voiceName: string): VoiceTier {
  const voice = getVoiceOption(voiceName);
  if (voice) return voice.tier;

  const lowerName = voiceName.toLowerCase();
  if (lowerName.includes("chirp3")) return "chirp3";
  if (lowerName.includes("wavenet")) return "wavenet";
  if (lowerName.includes("neural2")) return "neural2";
  if (lowerName.includes("studio")) return "studio";
  return "standard";
}

/** Whether synthesis should use Chirp 3 markup input (Phase 3+) */
export function isChirp3Voice(voiceName: string): boolean {
  return getVoiceTier(voiceName) === "chirp3";
}

/**
 * Price multiplier for standard-equivalent quota (Standard 1x, WaveNet/Neural2 4x, Chirp3 8x, Studio 16x)
 */
export function getPriceMultiplier(voiceName: string): number {
  const voice = getVoiceOption(voiceName);
  if (voice) return voice.priceMultiplier;
  return TIER_MULTIPLIERS[getVoiceTier(voiceName)];
}

/**
 * Convert raw synthesized characters to standard-equivalent quota usage
 */
export function toWeightedCharacters(
  rawCharacters: number,
  voiceName: string,
): number {
  return rawCharacters * getPriceMultiplier(voiceName);
}

/**
 * Get voice display label with tier
 */
export function getVoiceLabel(name: string): string {
  const voice = getVoiceOption(name);
  if (!voice) return name;
  const tierInfo = VOICE_TIER_INFO[voice.tier];
  return `${voice.label} (${tierInfo.label})`;
}

/**
 * Get voices grouped by tier
 */
export function getVoicesByTier(): Record<VoiceTier, TTSVoiceOption[]> {
  return {
    standard: TTS_VOICE_OPTIONS.filter((v) => v.tier === "standard"),
    wavenet: TTS_VOICE_OPTIONS.filter((v) => v.tier === "wavenet"),
    neural2: TTS_VOICE_OPTIONS.filter((v) => v.tier === "neural2"),
    chirp3: TTS_VOICE_OPTIONS.filter((v) => v.tier === "chirp3"),
    studio: TTS_VOICE_OPTIONS.filter((v) => v.tier === "studio"),
  };
}
