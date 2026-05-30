import { describe, expect, it } from "vitest";
import { chunkText, stripHtmlToPlainText } from "~/server/services/tts";
import {
  getPriceMultiplier,
  toWeightedCharacters,
  TTS_FREE_TIER_LIMIT,
} from "~/lib/tts-voices";

describe("chunkText", () => {
  it("preserves total character count for short text", () => {
    const text = "Hello world. This is a test.";
    const chunks = chunkText(text);
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    expect(total).toBe(text.length);
    expect(chunks).toEqual([text]);
  });

  it("preserves total character count when splitting long text", () => {
    const sentence = "This is a sentence that repeats. ";
    const text = sentence.repeat(200).trim();
    const chunks = chunkText(text, 4000);
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    expect(total).toBe(text.length);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4000);
    }
  });

  it("preserves total character count for text with long unbroken segments", () => {
    const text = `${"word ".repeat(500)}${"x".repeat(5000)} end.`;
    const chunks = chunkText(text, 4000);
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    expect(total).toBe(text.length);
  });
});

describe("stripHtmlToPlainText", () => {
  it("extracts speakable text from HTML", () => {
    const html = "<p>Hello</p><p>World</p>";
    const plain = stripHtmlToPlainText(html);
    expect(plain).toContain("Hello");
    expect(plain).toContain("World");
  });
});

describe("weighted TTS quota", () => {
  it("applies 1x multiplier for Standard voices", () => {
    expect(getPriceMultiplier("en-US-Standard-A")).toBe(1);
    expect(toWeightedCharacters(1000, "en-US-Standard-A")).toBe(1000);
  });

  it("applies 4x multiplier for Neural2 voices", () => {
    expect(getPriceMultiplier("en-US-Neural2-C")).toBe(4);
    expect(toWeightedCharacters(1000, "en-US-Neural2-C")).toBe(4000);
  });

  it("applies 16x multiplier for Studio voices", () => {
    expect(getPriceMultiplier("en-US-Studio-O")).toBe(16);
    expect(toWeightedCharacters(1000, "en-US-Studio-O")).toBe(16000);
  });

  it("uses unified 4M standard-equivalent free tier limit", () => {
    expect(TTS_FREE_TIER_LIMIT).toBe(4_000_000);
  });
});
