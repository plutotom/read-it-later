// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Article } from "~/types/article";

const state = vi.hoisted(() => ({
  setRead: vi.fn(),
  isPending: false,
  paraEnabled: true,
}));

vi.mock("~/hooks/use-para-enabled", () => ({
  useParaEnabled: () => ({
    paraEnabled: state.paraEnabled,
    isLoading: false,
  }),
}));
vi.mock("../_hooks/use-set-article-read", () => ({
  useSetArticleRead: () => ({
    setRead: state.setRead,
    isPending: state.isPending,
  }),
}));
vi.mock("./para-toggle", () => ({
  ParaToggle: () => null,
}));
vi.mock("./share-dialog", () => ({
  ShareDialog: () => null,
}));
vi.mock("~/components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));
vi.mock("~/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: (event: { stopPropagation: () => void }) => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onClick?.({ stopPropagation: () => undefined })}
    >
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

import { ArticleActionsMenu } from "./article-actions-menu";
import { GeneralProvider } from "../(protected)/contexts/general-context";

const article: Article = {
  id: "article-1",
  url: "https://example.invalid/post",
  title: "Synthetic article",
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
  state.setRead.mockReset();
  state.isPending = false;
  state.paraEnabled = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function mount(overrides: Partial<Article> = {}) {
  await act(async () => {
    root.render(
      <GeneralProvider>
        <ArticleActionsMenu
          article={{ ...article, ...overrides }}
          alwaysVisible
        />
      </GeneralProvider>,
    );
  });
}

function actionLabel(name: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (node) => node.textContent?.replace(/\s+/g, " ").trim() === name,
  );
}

it("offers mark as read for unread articles", async () => {
  await mount({ isRead: false });
  expect(actionLabel("Mark as read")).toBeDefined();
  expect(actionLabel("Mark as unread")).toBeUndefined();
});

it("offers mark as unread for read articles", async () => {
  await mount({ isRead: true });
  expect(actionLabel("Mark as unread")).toBeDefined();
  expect(actionLabel("Mark as read")).toBeUndefined();
});

it("marks an unread article as read from the menu", async () => {
  await mount({ isRead: false });
  await act(async () => {
    actionLabel("Mark as read")?.click();
  });
  expect(state.setRead).toHaveBeenCalledWith("article-1", true);
});

it("marks a read article as unread from the menu", async () => {
  await mount({ isRead: true });
  await act(async () => {
    actionLabel("Mark as unread")?.click();
  });
  expect(state.setRead).toHaveBeenCalledWith("article-1", false);
});
