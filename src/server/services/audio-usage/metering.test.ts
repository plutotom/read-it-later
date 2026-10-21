import { describe, expect, it } from "vitest";
import {
  estimatedUsd,
  googleModel,
  month,
  prepareSpeech,
  rateFor,
  speechifyInput,
} from "./metering";

describe("provider metering and precise prices", () => {
  it("counts the submitted normalized payload, retaining Unicode and escaped SSML", () => {
    const text = "word ".repeat(300) + "😀 & < 漢字";
    const google = prepareSpeech(text, "google", "chirp3-hd", "voice");
    expect(google.submitted).not.toBe(text);
    expect(google.requestedUnits).toBe(Array.from(google.submitted).length);
    expect(google.measurement).toBe("input_codepoints_estimate");
    const inworld = prepareSpeech("😀漢字", "inworld", "flash", "voice");
    expect(inworld.requestedUnits).toBe(4);
    expect(inworld.unit).toBe("utf16_characters");
    const ssml = prepareSpeech("& < 😀", "speechify", "simba", "voice");
    expect(ssml.submitted).toBe(speechifyInput("& < 😀"));
    expect(ssml.submitted).toBe("<speak>&amp; &lt; 😀</speak>");
    expect(ssml.payloadHash).not.toBe(
      prepareSpeech("& < 😀", "speechify", "other", "voice").payloadHash,
    );
  });
  it("retains sub-cent costs and explicit zero, and never assigns zero to missing prices", () => {
    expect(estimatedUsd(1, "0.123456789")).toBe("0.000000123456789");
    expect(estimatedUsd(10000, "30")).toBe("0.300000000000000");
    expect(estimatedUsd(0, "30")).toBe("0.000000000000000");
    expect(estimatedUsd(1000, null)).toBeNull();
    expect(() => estimatedUsd(-1, "30")).toThrow();
  });
  it("selects effective dated contract rates by account/model/unit without quota multipliers", () => {
    const now = new Date("2026-10-21T12:00:00Z");
    expect(
      rateFor("google", "wavenet", "characters", "default", undefined, now)
        ?.usdPerMillion,
    ).toBe("4");
    expect(
      rateFor("google", "studio", "characters", "default", undefined, now)
        ?.usdPerMillion,
    ).toBe("160");
    expect(
      rateFor("speechify", "simba", "characters", "default", undefined, now),
    ).toBeUndefined();
    const cards = JSON.stringify([
      {
        provider: "google",
        model: "chirp3-hd",
        unit: "characters",
        account: "contract",
        effectiveFrom: "2026-10-01T00:00:00Z",
        version: "contract-v1",
        usdPerMillion: "25",
      },
      {
        provider: "google",
        model: "chirp3-hd",
        unit: "characters",
        account: "contract",
        effectiveFrom: "2026-11-01T00:00:00Z",
        version: "contract-v2",
        usdPerMillion: "20",
      },
    ]);
    expect(
      rateFor("google", "chirp3-hd", "characters", "contract", cards, now)
        ?.version,
    ).toBe("contract-v1");
    expect(
      rateFor("google", "chirp3-hd", "characters", "default", cards, now)
        ?.usdPerMillion,
    ).toBe("30");
    expect(googleModel("en-US-Chirp3-HD-Charon")).toBe("chirp3-hd");
    expect(month(new Date("2026-10-31T23:30:00-05:00"))).toBe("2026-11");
  });
  it("prefers applicable configured contracts over newer public fallbacks and sorts instants", () => {
    const card = {
      provider: "google",
      model: "chirp3-hd",
      unit: "characters",
      account: "default",
      effectiveFrom: "2026-10-01T00:00:00Z",
      version: "contract",
      usdPerMillion: "25",
    };
    const now = new Date("2026-10-21T12:00:00Z");
    const select = (cards: unknown[]) =>
      rateFor(
        "google",
        "chirp3-hd",
        "characters",
        "default",
        JSON.stringify(cards),
        now,
      );
    expect(select([card])?.usdPerMillion).toBe("25");
    expect(
      select([
        { ...card, effectiveFrom: "2026-11-01T00:00:00Z" },
        { ...card, account: "other" },
      ])?.version,
    ).toBe("google-public-2026-10-21");
    expect(
      select([
        card,
        {
          ...card,
          effectiveFrom: "2026-10-01T00:00:00.100Z",
          version: "later",
        },
      ])?.version,
    ).toBe("later");
  });
});
