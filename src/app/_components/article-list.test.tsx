// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Article } from "~/types/article";

vi.mock("~/hooks/use-para-enabled", () => ({
  useParaEnabled: () => ({ paraEnabled: false, isLoading: false }),
}));
vi.mock("~/trpc/react", () => ({
  api: {
    para: {
      getArticleStatuses: {
        useQuery: () => ({ data: {} }),
      },
    },
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));
vi.mock("./article-actions-menu", () => ({
  ArticleActionsMenu: () => null,
}));

import { ArticleList } from "./article-list";

function article(overrides: Partial<Article>): Article {
  return {
    id: "article-1",
    url: "https://example.invalid/post",
    title: "Unread story",
    content: "<p>Hello</p>",
    excerpt: "Hello",
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
    ...overrides,
  };
}

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

it("keeps unread as a filter on Inbox, not a destination", async () => {
  await act(async () => {
    root.render(
      <ArticleList
        articles={[
          article({ id: "unread", title: "Still unread", isRead: false }),
          article({
            id: "read",
            title: "Already read",
            isRead: true,
            createdAt: new Date(1),
          }),
        ]}
        showUnreadFilter
      />,
    );
  });

  expect(container.textContent).toContain("All");
  expect(container.textContent).toContain("Unread");
  expect(container.textContent).toContain("Still unread");
  expect(container.textContent).toContain("Already read");

  const unreadChip = Array.from(container.querySelectorAll("button")).find(
    (node) => node.textContent?.trim() === "Unread",
  );
  await act(async () => {
    unreadChip?.click();
  });

  expect(container.textContent).toContain("Still unread");
  expect(container.textContent).not.toContain("Already read");
});

it("does not show the unread chip outside Inbox", async () => {
  await act(async () => {
    root.render(
      <ArticleList articles={[article({ title: "Archived unread" })]} />,
    );
  });
  expect(
    Array.from(container.querySelectorAll("button")).some(
      (node) => node.textContent?.trim() === "Unread",
    ),
  ).toBe(false);
});
