// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { COMING_FORMATS, SHIPPED_CAPABILITIES } from "~/lib/coming-formats";
import { ComingSoon } from "./coming-soon";

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

it("lists shipped work and the four coming formats", async () => {
  await act(async () => root.render(<ComingSoon />));

  expect(
    container.querySelector('a[href="/preferences"]')?.textContent,
  ).toContain("Preferences");
  expect(container.textContent).toContain("Already here");
  expect(container.textContent).toContain("Coming next");

  for (const item of SHIPPED_CAPABILITIES) {
    expect(container.textContent).toContain(item.title);
  }
  for (const format of COMING_FORMATS) {
    expect(container.textContent).toContain(format.title);
    expect(container.textContent).toContain(format.promise);
  }

  expect(container.textContent).toContain("That is the list.");
  expect(container.textContent).toContain("Here");
  expect(container.textContent).toContain("Underway");
  expect(container.textContent).toContain("5 here");
  expect(container.textContent).toContain("1 of 4 in motion");
  expect(container.textContent).toContain("Notes still open");
  expect(container.textContent).toContain("Internal TestFlight");
  expect(container.textContent).toContain("Spec and detection");

  const bars = container.querySelectorAll('[role="progressbar"]');
  expect(bars).toHaveLength(9);
  expect(bars[0]?.getAttribute("aria-valuenow")).toBe("100");
  expect(bars[2]?.getAttribute("aria-valuenow")).toBe("60");
  expect(bars[4]?.getAttribute("aria-valuenow")).toBe("83");
  expect(bars[5]?.getAttribute("aria-valuenow")).toBe("40");
  expect(bars[6]?.getAttribute("aria-valuenow")).toBe("0");
});
