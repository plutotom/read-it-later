// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const para = vi.hoisted(() => ({
  paraEnabled: true,
  isLoading: false,
}));

vi.mock("~/hooks/use-para-enabled", () => ({
  useParaEnabled: () => para,
}));
vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      para: {
        isOnPara: { invalidate: vi.fn() },
        getArticleStatuses: { invalidate: vi.fn() },
        list: { invalidate: vi.fn() },
        getTotalBytes: { invalidate: vi.fn() },
      },
    }),
    para: {
      isOnPara: {
        useQuery: () => ({ data: false, isLoading: false }),
      },
      add: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      remove: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { ParaToggle } from "./para-toggle";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  para.paraEnabled = true;
  para.isLoading = false;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("hides the toggle when PARA is disabled", async () => {
  para.paraEnabled = false;
  await act(async () => {
    root.render(<ParaToggle articleId="article-1" variant="menu" />);
  });
  expect(container.textContent).toBe("");
});

it("renders the add action when PARA is enabled", async () => {
  await act(async () => {
    root.render(<ParaToggle articleId="article-1" variant="menu" />);
  });
  expect(container.textContent).toContain("Add to Para");
});
