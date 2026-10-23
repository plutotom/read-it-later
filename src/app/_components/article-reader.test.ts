// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Article } from "~/types/article";
import type { ArticleViewMode } from "~/lib/article-web-view";
import { ArticleReader } from "./article-reader";

const mocks = vi.hoisted(() => ({ pause: vi.fn(), mediaPause: vi.fn() }));
vi.mock("./document-extraction-banner", () => ({
  DocumentExtractionBanner: () => null,
}));
vi.mock("./article-reader-header", () => ({
  ArticleReaderHeader: ({
    onViewModeChange,
  }: {
    onViewModeChange?: (mode: ArticleViewMode) => void;
  }) =>
    onViewModeChange &&
    createElement(
      "nav",
      null,
      ...(["reader", "web"] as const).map((mode) =>
        createElement(
          "button",
          { key: mode, onClick: () => onViewModeChange(mode) },
          mode,
        ),
      ),
    ),
}));
vi.mock("~/hooks/use-highlights", () => ({
  useHighlights: () => ({ highlights: [], updateHighlight: vi.fn() }),
}));
vi.mock("~/hooks/use-highlight-painter", () => ({
  useHighlightPainter: () => undefined,
}));
vi.mock("~/hooks/use-reader-listening", () => ({
  useReaderListening: () => ({
    controller: { pause: mocks.pause },
    voices: [],
  }),
}));
vi.mock("~/hooks/use-article-toc", () => ({
  useTocOpenPreference: () => ({ isOpen: true }),
  useArticleToc: () => ({ hasToc: true, headings: [] }),
}));
vi.mock("./article-table-of-contents", () => ({
  ArticleTableOfContents: () => createElement("aside", null, "Contents"),
}));
vi.mock("./highlight-toolbar", () => ({ HighlightToolbar: () => null }));
vi.mock("./listening-highlights", () => ({ ListeningHighlights: () => null }));
vi.mock("./streaming-audio-player", () => ({
  StreamingAudioPlayer: () => createElement("audio"),
}));
vi.mock("./audio-player", () => ({ AudioPlayer: () => null }));
vi.mock("./pdf-viewer-dynamic", () => ({ PdfViewer: () => null }));
vi.mock("./standalone-notes", () => ({ StandaloneNotes: () => null }));

const article: Article = {
  id: "synthetic-article",
  url: "https://example.com/interactive",
  title: "Synthetic interactive article",
  content: "<h2>Section</h2><p>Saved reading text.</p>",
  excerpt: null,
  author: null,
  publishedAt: null,
  isFavorite: false,
  readAt: null,
  isRead: true,
  isArchived: false,
  folderId: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  wordCount: 100,
  readingTime: 1,
  tags: [],
  metadata: null,
  shareToken: null,
};

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(
    mocks.mediaPause,
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (node) => node.textContent === label,
  );
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}

it("loads the original only on demand, pauses playback, and restores the same reader DOM and scroll position", async () => {
  await act(async () => root.render(createElement(ArticleReader, { article })));
  expect(container.querySelector("iframe")).toBeNull();
  const content = container.querySelector(".article-content")!;
  const scroller = content.closest("article")!.parentElement!;
  await act(async () => {
    scroller.scrollTop = 350;
    scroller.dispatchEvent(new Event("scroll"));
  });
  await click("web");
  expect(container.querySelector("iframe")?.src).toBe(article.url);
  expect(scroller.classList.contains("hidden")).toBe(true);
  expect(container.querySelector("aside")).toBeNull();
  expect(mocks.pause).toHaveBeenCalledOnce();
  expect(mocks.mediaPause).toHaveBeenCalledOnce();
  // Simulate the hidden scroller losing its layout position.
  scroller.scrollTop = 0;
  await click("reader");
  expect(container.querySelector("iframe")).toBeNull();
  expect(container.querySelector(".article-content")).toBe(content);
  expect(scroller.classList.contains("hidden")).toBe(false);
  expect(scroller.scrollTop).toBe(350);
  expect(container.querySelector("aside")).not.toBeNull();
});

it.each([
  { ...article, url: "javascript:alert(1)" },
  { ...article, metadata: { contentKind: "pdf" } },
])(
  "does not offer embedded Web view for unsafe URLs or PDFs",
  async (savedArticle) => {
    await act(async () =>
      root.render(createElement(ArticleReader, { article: savedArticle })),
    );
    expect(container.querySelector("nav")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
  },
);
