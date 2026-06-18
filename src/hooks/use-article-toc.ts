"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type RefObject,
} from "react";
import { uniqueHeadingId } from "~/lib/heading-slug";

export interface TocHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

const TOC_OPEN_STORAGE_KEY = "articleTocOpen";
const TOC_HEADING_ATTR = "data-toc-id";
const MIN_HEADINGS_FOR_TOC = 2;
const HEADING_SCAN_DELAY_MS = 50;
const SCROLL_LOCK_MS = 900;
/**
 * Active section switches when a heading crosses this fraction of the scrollport
 * height (0.5 = middle of the screen).
 */
const ACTIVE_SECTION_VIEWPORT_RATIO = 0.5;

function getContentRoot(
  contentRef: RefObject<HTMLDivElement | null>,
): HTMLElement | null {
  const root = contentRef.current;
  if (!root) return null;
  return root.querySelector("div") ?? root;
}

function isVisibleHeading(node: HTMLElement): boolean {
  if (node.closest("script, style, noscript, template")) return false;
  const style = window.getComputedStyle(node);
  return style.display !== "none" && style.visibility !== "hidden";
}

function extractHeadings(contentRoot: HTMLElement): TocHeading[] {
  const slugCounts = new Map<string, number>();
  const result: TocHeading[] = [];

  contentRoot.querySelectorAll("h2, h3").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (!isVisibleHeading(node)) return;

    const text = node.textContent?.trim() ?? "";
    if (!text) return;

    const level = node.tagName === "H2" ? 2 : 3;
    let tocId = node.getAttribute(TOC_HEADING_ATTR);
    if (!tocId) {
      tocId = uniqueHeadingId(text, slugCounts);
      node.setAttribute(TOC_HEADING_ATTR, tocId);
    }

    if (!node.id) {
      node.id = tocId;
    }

    result.push({ id: tocId, text, level });
  });

  return result;
}

function headingsEqual(a: TocHeading[], b: TocHeading[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (heading, index) =>
      heading.id === b[index]?.id &&
      heading.text === b[index]?.text &&
      heading.level === b[index]?.level,
  );
}

function findHeadingElement(
  contentRoot: HTMLElement,
  tocId: string,
): HTMLElement | null {
  for (const node of contentRoot.querySelectorAll<HTMLElement>(
    `[${TOC_HEADING_ATTR}]`,
  )) {
    if (node.getAttribute(TOC_HEADING_ATTR) === tocId) {
      return node;
    }
  }
  return null;
}

interface TocMeasurements {
  /** Distance from the scroller's content top to the contentRoot's top. */
  baseOffset: number;
  /** Heading tops measured relative to the contentRoot (scroll-independent). */
  headingTops: Map<string, number>;
}

/**
 * Measure heading positions relative to the contentRoot. Heading rects and the
 * contentRoot rect live in the same scrolled layer, so these numbers stay
 * consistent even if measured mid-scroll. Only `baseOffset` relates the two
 * layers, computed from scrollTop in the same frame.
 */
function measureToc(
  scroller: HTMLElement,
  contentRoot: HTMLElement,
  headings: TocHeading[],
): TocMeasurements {
  const contentRect = contentRoot.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const baseOffset = contentRect.top - scrollerRect.top + scroller.scrollTop;
  const headingTops = new Map<string, number>();

  for (const heading of headings) {
    const element = findHeadingElement(contentRoot, heading.id);
    if (!element) continue;
    headingTops.set(
      heading.id,
      element.getBoundingClientRect().top - contentRect.top,
    );
  }

  return { baseOffset, headingTops };
}

/**
 * Returns the active heading id, or undefined when measurements are unusable
 * (callers must not change the active state in that case).
 */
function resolveActiveHeadingId(
  scrollTop: number,
  viewportHeight: number,
  headings: TocHeading[],
  measurements: TocMeasurements,
): string | null | undefined {
  if (headings.length === 0) return null;

  const marker = scrollTop + viewportHeight * ACTIVE_SECTION_VIEWPORT_RATIO;
  let activeId: string | undefined;
  let sawMeasurement = false;

  for (const heading of headings) {
    const top = measurements.headingTops.get(heading.id);
    if (top === undefined) continue;

    if (!sawMeasurement) {
      sawMeasurement = true;
      activeId = heading.id;
    }

    if (top + measurements.baseOffset <= marker) {
      activeId = heading.id;
    } else {
      break;
    }
  }

  return sawMeasurement ? activeId : undefined;
}

export function useTocOpenPreference() {
  const [isOpen, setIsOpen] = useState(true);
  const skipNextPersistRef = useRef(true);

  useEffect(() => {
    const stored = localStorage.getItem(TOC_OPEN_STORAGE_KEY);
    setIsOpen(stored !== null ? stored === "true" : true);
  }, []);

  useEffect(() => {
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    localStorage.setItem(TOC_OPEN_STORAGE_KEY, String(isOpen));
  }, [isOpen]);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  return { isOpen, setIsOpen, toggle, close, open };
}

interface UseArticleTocOptions {
  contentRef: RefObject<HTMLDivElement | null>;
  scrollerRef: RefObject<HTMLDivElement | null>;
  contentKey: string;
}

export function useArticleToc({
  contentRef,
  scrollerRef,
  contentKey,
}: UseArticleTocOptions) {
  const [headings, setHeadings] = useState<TocHeading[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const clickLockRef = useRef(false);
  const clickLockTimeoutRef = useRef<number | null>(null);
  const headingsRef = useRef<TocHeading[]>([]);
  const measurementsRef = useRef<TocMeasurements | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const scrollEndTimeoutRef = useRef<number | null>(null);

  headingsRef.current = headings;

  const refreshMeasurements = useCallback(() => {
    const scroller = scrollerRef.current;
    const contentRoot = getContentRoot(contentRef);
    const currentHeadings = headingsRef.current;

    if (!scroller || !contentRoot || currentHeadings.length === 0) {
      measurementsRef.current = null;
      return;
    }

    measurementsRef.current = measureToc(scroller, contentRoot, currentHeadings);
  }, [contentRef, scrollerRef]);

  const updateActiveHeading = useCallback(() => {
    const scroller = scrollerRef.current;
    const currentHeadings = headingsRef.current;
    const measurements = measurementsRef.current;

    if (!scroller || currentHeadings.length === 0 || !measurements) return;

    const nextActiveId = resolveActiveHeadingId(
      scroller.scrollTop,
      scroller.clientHeight,
      currentHeadings,
      measurements,
    );

    // undefined means we couldn't measure — keep the current highlight.
    if (nextActiveId === undefined) return;

    setActiveId((prev) => (prev === nextActiveId ? prev : nextActiveId));
  }, [scrollerRef]);

  const scanHeadings = useCallback(() => {
    const contentRoot = getContentRoot(contentRef);
    if (!contentRoot) {
      setHeadings([]);
      return;
    }

    const nextHeadings = extractHeadings(contentRoot);
    setHeadings((prev) =>
      headingsEqual(prev, nextHeadings) ? prev : nextHeadings,
    );
  }, [contentRef]);

  const syncHeadingsAndActive = useCallback(() => {
    scanHeadings();
    requestAnimationFrame(() => {
      refreshMeasurements();
      updateActiveHeading();
    });
  }, [scanHeadings, refreshMeasurements, updateActiveHeading]);

  useEffect(() => {
    const timeoutId = window.setTimeout(syncHeadingsAndActive, HEADING_SCAN_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [syncHeadingsAndActive, contentKey]);

  useEffect(() => {
    const contentRoot = getContentRoot(contentRef);
    if (!contentRoot) return;

    let debounceId: number | null = null;
    const observer = new MutationObserver(() => {
      if (debounceId !== null) {
        window.clearTimeout(debounceId);
      }
      debounceId = window.setTimeout(() => {
        scanHeadings();
        refreshMeasurements();
        updateActiveHeading();
        debounceId = null;
      }, 150);
    });

    observer.observe(contentRoot, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      if (debounceId !== null) {
        window.clearTimeout(debounceId);
      }
    };
  }, [
    contentRef,
    contentKey,
    scanHeadings,
    refreshMeasurements,
    updateActiveHeading,
  ]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const SCROLL_END_MS = 150;

    const onScroll = () => {
      if (clickLockRef.current) return;

      // Live update from scrollTop + cached measurements; throttled to frames.
      scrollRafRef.current ??= requestAnimationFrame(() => {
        scrollRafRef.current = null;
        updateActiveHeading();
      });

      if (scrollEndTimeoutRef.current !== null) {
        window.clearTimeout(scrollEndTimeoutRef.current);
      }

      // Re-measure after scrolling settles, in case lazy content shifted layout.
      scrollEndTimeoutRef.current = window.setTimeout(() => {
        refreshMeasurements();
        updateActiveHeading();
        scrollEndTimeoutRef.current = null;
      }, SCROLL_END_MS);
    };

    const onResize = () => {
      refreshMeasurements();
      updateActiveHeading();
    };

    refreshMeasurements();
    updateActiveHeading();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
      if (scrollEndTimeoutRef.current !== null) {
        window.clearTimeout(scrollEndTimeoutRef.current);
      }
    };
  }, [scrollerRef, updateActiveHeading, refreshMeasurements, contentKey]);

  const scrollToHeading = useCallback(
    (id: string) => {
      const contentRoot = getContentRoot(contentRef);
      if (!contentRoot) return;

      const heading = findHeadingElement(contentRoot, id);
      if (!heading) return;

      if (clickLockTimeoutRef.current !== null) {
        window.clearTimeout(clickLockTimeoutRef.current);
      }

      clickLockRef.current = true;
      setActiveId(id);

      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const scrollBehavior = prefersReducedMotion ? "auto" : "smooth";

      heading.scrollIntoView({
        behavior: scrollBehavior,
        block: "start",
        inline: "nearest",
      });

      clickLockTimeoutRef.current = window.setTimeout(() => {
        clickLockRef.current = false;
        refreshMeasurements();
        updateActiveHeading();
        clickLockTimeoutRef.current = null;
      }, SCROLL_LOCK_MS);
    },
    [contentRef, refreshMeasurements, updateActiveHeading],
  );

  useEffect(() => {
    return () => {
      if (clickLockTimeoutRef.current !== null) {
        window.clearTimeout(clickLockTimeoutRef.current);
      }
    };
  }, []);

  const hasToc = headings.length >= MIN_HEADINGS_FOR_TOC;

  return {
    headings,
    activeId,
    scrollToHeading,
    hasToc,
  };
}
