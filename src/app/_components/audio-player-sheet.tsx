"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "~/lib/utils";

interface AudioPlayerSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function AudioPlayerSheet({
  open,
  onClose,
  title,
  children,
}: AudioPlayerSheetProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close player"
        onClick={onClose}
        className={cn(
          "audio-player-sheet-scrim fixed inset-0 z-[60]",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <div
        role="dialog"
        aria-modal="false"
        aria-label={title}
        aria-hidden={!open}
        className={cn(
          "audio-player-sheet fixed inset-x-0 bottom-0 z-[70] flex max-h-[min(88dvh,780px)] flex-col overflow-visible",
          open ? "translate-y-0" : "pointer-events-none translate-y-full",
        )}
      >
        <div className="flex shrink-0 justify-center pt-2 pb-2">
          <button
            type="button"
            onClick={onClose}
            className="audio-player-sheet__grabber"
            aria-label="Dismiss player"
          />
        </div>
        {children}
      </div>
    </>,
    document.body,
  );
}
