"use client";

import { useEffect } from "react";
import { MATTER_DARK as p } from "./palette";
import { ExpandedVariantContent } from "./expanded-variants";
import type { ExpandedVariant, MockArticle, MockPlayback } from "./types";

interface ExpandedSheetProps {
  open: boolean;
  variant: ExpandedVariant;
  article: MockArticle;
  playback: MockPlayback;
  onClose: () => void;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onCycleSpeed: () => void;
}

export function ExpandedSheet({
  open,
  variant,
  article,
  playback,
  onClose,
  onSeek,
  onTogglePlay,
  onCycleSpeed,
}: ExpandedSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close expanded player"
        onClick={onClose}
        className="absolute inset-0 z-30 transition-opacity duration-300"
        style={{
          background: p.scrim,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
      />

      {/* Sheet — ~88% height like reference */}
      <div
        className="absolute inset-x-0 bottom-0 z-40 flex max-h-[88%] min-h-[72%] flex-col rounded-t-[28px] border-t transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
        style={{
          background: p.surface,
          borderColor: p.rule,
          boxShadow: "0 -24px 80px rgba(0,0,0,0.45)",
          transform: open ? "translateY(0)" : "translateY(100%)",
        }}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
      >
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <button
            type="button"
            onClick={onClose}
            className="h-1 w-10 rounded-full"
            style={{ background: p.rule }}
            aria-label="Drag to dismiss"
          />
        </div>

        <ExpandedVariantContent
          variant={variant}
          article={article}
          playback={playback}
          onSeek={onSeek}
          onTogglePlay={onTogglePlay}
          onCycleSpeed={onCycleSpeed}
        />
      </div>
    </>
  );
}
