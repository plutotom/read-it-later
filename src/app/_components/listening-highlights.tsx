"use client";

import { useEffect, type RefObject } from "react";
import type { ListeningController } from "~/lib/listening/controller";
import { buildTextNodeIndex, rangeFromOffsets } from "~/lib/highlight-anchor";

export function ListeningHighlights({
  controller,
  contentRef,
}: {
  controller: ListeningController;
  contentRef: RefObject<HTMLElement | null>;
}) {
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const index = buildTextNodeIndex(root);
    const api = globalThis as unknown as {
      CSS?: { highlights?: Map<string, object> };
      Highlight?: new (...ranges: Range[]) => { priority: number };
    };
    let previous = "";
    let fallback: HTMLElement | null = null;
    const paint = () => {
      const { paragraph, word } = controller.getSnapshot();
      const key = JSON.stringify([paragraph, word]);
      if (key === previous) return;
      previous = key;
      fallback?.classList.remove("listening-paragraph");
      fallback = null;
      for (const [name, position, priority] of [
        ["ril-speech-paragraph", paragraph, 1],
        ["ril-speech-word", word, 2],
      ] as const) {
        api.CSS?.highlights?.delete(name);
        if (!position) continue;
        const range = rangeFromOffsets(
          root,
          position.start,
          position.end,
          index,
        );
        if (!range) continue;
        if (api.Highlight && api.CSS?.highlights) {
          const highlight = new api.Highlight(range);
          highlight.priority = priority;
          api.CSS.highlights.set(name, highlight);
        } else if (name === "ril-speech-paragraph") {
          fallback =
            range.startContainer.parentElement?.closest<HTMLElement>(
              "p,li,blockquote,h1,h2,h3,h4,h5,h6,pre,td,div",
            ) ?? null;
          fallback?.classList.add("listening-paragraph");
        }
      }
    };
    paint();
    const unsubscribe = controller.subscribe(paint);
    return () => {
      unsubscribe();
      fallback?.classList.remove("listening-paragraph");
      api.CSS?.highlights?.delete("ril-speech-paragraph");
      api.CSS?.highlights?.delete("ril-speech-word");
    };
  }, [controller, contentRef]);
  return null;
}
