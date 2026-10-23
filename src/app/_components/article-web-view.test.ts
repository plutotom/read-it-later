// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://reader.example.com"}

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ArticleWebView } from "./article-web-view";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mount(url = "https://example.com/interactive") {
  await act(async () =>
    root.render(
      createElement(ArticleWebView, {
        url,
        title: "Interactive article",
      }),
    ),
  );
}

it("allows scripts while isolating the original from the app and its referrer", async () => {
  await mount();
  const frame = container.querySelector("iframe")!;
  expect(frame.src).toBe("https://example.com/interactive");
  expect(frame.title).toContain("Interactive article");
  expect(frame.getAttribute("sandbox")?.split(" ")).toContain("allow-scripts");
  expect(frame.getAttribute("sandbox")?.split(" ")).not.toContain(
    "allow-same-origin",
  );
  expect(frame.getAttribute("sandbox")?.split(" ")).not.toContain(
    "allow-top-navigation",
  );
  expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
});

it("offers the original link instead of mixed content on an HTTPS reader", async () => {
  await mount("http://example.com/article");
  expect(container.querySelector("iframe")).toBeNull();
  expect(container.querySelector("a")?.href).toBe("http://example.com/article");
  expect(container.textContent).toContain("needs to open in a new tab");
});

it("keeps the escape link available even when a blocked frame emits load", async () => {
  await mount();
  await act(async () =>
    container.querySelector("iframe")!.dispatchEvent(new Event("load")),
  );
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(container.textContent).toContain(
    "Some sites don't allow embedded viewing",
  );
  const link = container.querySelector("a")!;
  expect(link.href).toBe("https://example.com/interactive");
  expect(link.target).toBe("_blank");
  expect(link.rel).toBe("noopener noreferrer");
});

it("offers a way out of a slow load and reloads the original frame", async () => {
  await mount();
  const frame = container.querySelector("iframe")!;
  await act(async () => vi.advanceTimersByTime(12_000));
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    "Taking a while?",
  );
  await act(async () =>
    container.querySelector<HTMLButtonElement>("button")!.click(),
  );
  expect(container.querySelector("iframe")).not.toBe(frame);
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    "Loading original website",
  );
});
