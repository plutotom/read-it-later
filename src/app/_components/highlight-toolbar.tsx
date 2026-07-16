"use client";

/**
 * Floating color picker that appears when the user selects text inside the
 * article. Picking a color creates a highlight from the current selection via
 * the shared anchoring contract. Positioning follows the selection's bounding
 * rect; on touch it sits just above the selection so it stays thumb-reachable.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { selectionToAnchor } from "~/lib/highlight-anchor";
import { HIGHLIGHT_COLORS } from "~/server/services/annotationService";
import type { HighlightColor } from "~/types/annotation";
import { cn } from "~/lib/utils";

const SWATCH_CLASS: Record<HighlightColor, string> = {
  yellow: "bg-[#ffd60a]",
  green: "bg-[#34d399]",
  blue: "bg-[#60a5fa]",
  pink: "bg-[#f472b6]",
  purple: "bg-[#a78bfa]",
  orange: "bg-[#fb923c]",
  red: "bg-[#f87171]",
  gray: "bg-[#9ca3af]",
};

export type CreateHighlightArgs = {
  text: string;
  startOffset: number;
  endOffset: number;
  contextPrefix: string;
  contextSuffix: string;
  version: number;
  anchorContentHash: string;
  color: HighlightColor;
};

type Props = {
  contentRef: RefObject<HTMLElement | null>;
  onCreate: (args: CreateHighlightArgs) => void;
};

type Anchored = {
  top: number;
  left: number;
  args: Omit<CreateHighlightArgs, "color">;
};

export function HighlightToolbar({ contentRef, onCreate }: Props) {
  const [anchored, setAnchored] = useState<Anchored | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(() => setAnchored(null), []);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    const handleSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setAnchored(null);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) {
        setAnchored(null);
        return;
      }
      const anchor = selectionToAnchor(root, selection);
      if (!anchor) {
        setAnchored(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setAnchored({
        top: rect.top,
        left: rect.left + rect.width / 2,
        args: anchor,
      });
    };

    // Selection changes fire often; only react after the gesture settles.
    const onPointerUp = () => window.setTimeout(handleSelection, 0);
    document.addEventListener("mouseup", onPointerUp);
    document.addEventListener("touchend", onPointerUp);
    return () => {
      document.removeEventListener("mouseup", onPointerUp);
      document.removeEventListener("touchend", onPointerUp);
    };
  }, [contentRef]);

  // Dismiss when scrolling or clicking elsewhere — the selection rect goes stale.
  useEffect(() => {
    if (!anchored) return;
    const onScroll = () => setAnchored(null);
    const onPointerDown = (e: Event) => {
      if (toolbarRef.current?.contains(e.target as Node)) return;
      setAnchored(null);
    };
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [anchored]);

  if (!anchored) return null;

  const handlePick = (color: HighlightColor) => {
    onCreate({ ...anchored.args, color });
    window.getSelection()?.removeAllRanges();
    dismiss();
  };

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Highlight color"
      className="border-rule bg-surface fixed z-50 -translate-x-1/2 -translate-y-full rounded-full border px-2 py-1.5 shadow-[var(--shadow-soft)]"
      style={{ top: anchored.top - 8, left: anchored.left }}
      // Prevent the toolbar from stealing the selection before the click lands.
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-1.5">
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Highlight ${color}`}
            onClick={() => handlePick(color)}
            className={cn(
              "h-5 w-5 rounded-full ring-1 ring-black/10 transition-transform hover:scale-110",
              SWATCH_CLASS[color],
            )}
          />
        ))}
      </div>
    </div>
  );
}
