import { expect, it } from "vitest";
import {
  COMING_FORMATS,
  COMING_FORMAT_IDS,
  SHIPPED_CAPABILITIES,
  SHIPPED_CAPABILITY_IDS,
  comingFormatDoneCount,
  comingFormatProgress,
  comingFormatsInMotion,
  type ComingFormatId,
} from "./coming-formats";

it("keeps the product limit to four named formats", () => {
  expect(COMING_FORMAT_IDS).toEqual([
    "pdf-epub",
    "youtube",
    "podcast",
    "academic-paper",
  ]);
  expect(COMING_FORMATS).toHaveLength(4);
  expect(COMING_FORMATS.map((format) => format.id)).toEqual([
    ...COMING_FORMAT_IDS,
  ]);
});

it("lists shipped capabilities, with highlights and iOS still unfinished", () => {
  expect(SHIPPED_CAPABILITY_IDS).toEqual([
    "articles",
    "listen",
    "highlights",
    "para",
    "ios-beta",
  ]);
  expect(SHIPPED_CAPABILITIES).toHaveLength(5);
  expect(SHIPPED_CAPABILITIES.every((item) => item.status === "here")).toBe(
    true,
  );
  expect(comingFormatProgress(SHIPPED_CAPABILITIES[0]!)).toBe(100);
  expect(comingFormatProgress(SHIPPED_CAPABILITIES[1]!)).toBe(100);
  expect(comingFormatProgress(SHIPPED_CAPABILITIES[2]!)).toBe(60);
  expect(comingFormatProgress(SHIPPED_CAPABILITIES[3]!)).toBe(100);
  expect(comingFormatProgress(SHIPPED_CAPABILITIES[4]!)).toBe(83);
});

it("marks only PDF & EPUB as already underway, with honest detection progress", () => {
  const byId = Object.fromEntries(
    COMING_FORMATS.map((format) => [format.id, format]),
  ) as Record<ComingFormatId, (typeof COMING_FORMATS)[number]>;

  expect(byId["pdf-epub"].status).toBe("underway");
  expect(comingFormatDoneCount(byId["pdf-epub"])).toBe(2);
  expect(comingFormatProgress(byId["pdf-epub"])).toBe(40);
  expect(byId.youtube.status).toBe("coming");
  expect(comingFormatProgress(byId.youtube)).toBe(0);
  expect(comingFormatProgress(byId.podcast)).toBe(0);
  expect(comingFormatProgress(byId["academic-paper"])).toBe(0);
  expect(comingFormatsInMotion()).toBe(1);
});
