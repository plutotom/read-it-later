// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  resetParaEnabledCache,
  setParaEnabled,
  useParaEnabled,
} from "./use-para-enabled";

function Probe() {
  const { paraEnabled, isLoading } = useParaEnabled();
  return createElement(
    "span",
    { "data-loading": isLoading ? "true" : "false" },
    paraEnabled ? "on" : "off",
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  resetParaEnabledCache();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  resetParaEnabledCache();
  vi.unstubAllGlobals();
});

it("defaults to enabled while the preference is loading", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => undefined)),
  );

  await act(async () => {
    root.render(createElement(Probe));
  });

  expect(container.textContent).toBe("on");
  expect(container.querySelector("span")?.dataset.loading).toBe("true");
});

it("defaults to enabled when the preference request fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

  await act(async () => {
    root.render(createElement(Probe));
  });

  expect(container.textContent).toBe("on");
  expect(container.querySelector("span")?.dataset.loading).toBe("false");
});

it("uses the stored false value once preferences load", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ paraEnabled: false }),
    }),
  );

  await act(async () => {
    root.render(createElement(Probe));
  });

  expect(container.textContent).toBe("off");
});

it("shares one preferences fetch across consumers", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ paraEnabled: true }),
  });
  vi.stubGlobal("fetch", fetchMock);

  await act(async () => {
    root.render(
      createElement("div", null, createElement(Probe), createElement(Probe)),
    );
  });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(container.textContent).toBe("onon");
});

it("picks up a later save without another fetch", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ paraEnabled: true }),
  });
  vi.stubGlobal("fetch", fetchMock);

  await act(async () => {
    root.render(createElement(Probe));
  });
  expect(container.textContent).toBe("on");

  await act(async () => {
    setParaEnabled(false);
  });

  expect(container.textContent).toBe("off");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
