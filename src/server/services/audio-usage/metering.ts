import { createHash } from "node:crypto";
import { z } from "zod";
import { enforceMaxSentenceLength } from "../tts-text";

export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const speechifyInput = (text: string) =>
  "<speak>" +
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;") +
  "</speak>";
export function prepareSpeech(
  text: string,
  provider: string,
  model: string,
  voice: string,
) {
  const submitted =
    provider === "google"
      ? enforceMaxSentenceLength(text)
      : provider === "speechify"
        ? speechifyInput(text)
        : text;
  return {
    submitted,
    provider,
    model,
    voice,
    payloadHash: hash(
      JSON.stringify(["prepared-v1", provider, model, voice, submitted]),
    ),
    // Google does not return billable usage: code points are a documented input estimate,
    // not an invoice. Inworld HTTP explicitly meters UTF-16; Speechify done overrides ours.
    requestedUnits:
      provider === "inworld" ? submitted.length : Array.from(submitted).length,
    unit: provider === "inworld" ? "utf16_characters" : "characters",
    measurement:
      provider === "google" ? "input_codepoints_estimate" : "input_estimate",
  };
}
export type PreparedSpeech = ReturnType<typeof prepareSpeech>;
const rateSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  unit: z.string().min(1),
  account: z.string().min(1).default("default"),
  effectiveFrom: z.iso.datetime(),
  version: z.string().min(1),
  usdPerMillion: z.string().regex(/^\d{1,12}(\.\d{1,9})?$/),
});
export type RateCard = z.infer<typeof rateSchema>;
export function googleModel(voice: string) {
  if (voice.includes("Chirp3-HD")) return "chirp3-hd";
  if (voice.includes("Neural2")) return "neural2";
  if (voice.includes("Studio")) return "studio";
  if (voice.includes("Wavenet")) return "wavenet";
  if (voice.includes("Standard")) return "standard";
  return "unknown";
}
export function rateFor(
  provider: string,
  model: string,
  unit: string,
  account: string,
  overrides?: string,
  now = new Date(),
): RateCard | undefined {
  // Gross public rates checked 2026-10-21. No per-user free-tier or subscription allocation.
  const defaults: RateCard[] = Object.entries({
    "chirp3-hd": "30",
    neural2: "16",
    studio: "160",
    wavenet: "4",
    standard: "4",
  }).map(([model, usdPerMillion]) => ({
    provider: "google",
    model,
    unit: "characters",
    account: "default",
    usdPerMillion,
    version: "google-public-2026-10-21",
    effectiveFrom: "2026-10-21T00:00:00.000Z",
  }));
  const configured = overrides
    ? z.array(rateSchema).parse(JSON.parse(overrides))
    : [];
  return [...configured, ...defaults]
    .filter(
      (r) =>
        r.provider === provider &&
        r.model === model &&
        r.unit === unit &&
        r.account === account &&
        new Date(r.effectiveFrom) <= now,
    )
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}
/** Exact USD to 15 places: nine rate decimals + six (million). No floating point. */
export function estimatedUsd(
  units: number,
  rate: string | null | undefined,
): string | null {
  if (rate == null) return null;
  if (!Number.isSafeInteger(units) || units < 0)
    throw new Error("Invalid audio units");
  const [whole, fraction = ""] = rate.split(".");
  const value = BigInt(units) * BigInt(whole! + fraction.padEnd(9, "0"));
  const digits = value.toString().padStart(16, "0");
  return digits.slice(0, -15) + "." + digits.slice(-15);
}
export const month = (date = new Date()) => date.toISOString().slice(0, 7);
