// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Article } from "~/types/article";

vi.mock("~/hooks/use-para-enabled", () => ({
  useParaEnabled: () => ({ paraEnabled: false, isLoading: false }),
}));
vi.mock("./article-actions-menu", () => ({
  ArticleActionsMenu: () => null,
}));

import { ArticleCard } from "./article-card";

const base: Article = {
  id: "article-1",
  url: "https://example.invalid/post",
  title: "A saved story",
  content: "<p>Hello</p>",
  excerpt: null,
  author: null,
  publishedAt: null,
  isFavorite: false,
  readAt: null,
  isRead: false,
  isArchived: false,
  folderId: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  wordCount: 1,
  readingTime: 1,
  tags: [],
  metadata: null,
  shareToken: null,
};

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("marks unread titles in the list", async () => {
  await act(async () => {
    root.render(<ArticleCard article={base} showActions={false} />);
  });
  expect(container.querySelector("[data-unread='true']")?.textContent).toBe(
    "A saved story",
  );
});

it("does not mark read titles as unread", async () => {
  await act(async () => {
    root.render(
      <ArticleCard article={{ ...base, isRead: true }} showActions={false} />,
    );
  });
  expect(container.querySelector("[data-unread]")).toBeNull();
});
