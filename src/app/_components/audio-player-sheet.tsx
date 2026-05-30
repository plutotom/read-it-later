"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "~/lib/utils";

interface AudioPlayerSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const DISMISS_DISTANCE_PX = 96;
const DISMISS_FRACTION = 0.2;
const DISMISS_VELOCITY_PX_MS = 0.45;
const DRAG_COMMIT_PX = 10;

export function AudioPlayerSheet({
  open,
  onClose,
  title,
  children,
}: AudioPlayerSheetProps) {
  const [hasOpened, setHasOpened] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef(0);
  const dragStartYRef = useRef(0);
  const dragStartXRef = useRef(0);
  const dragStartOffsetRef = useRef(0);
  const lastYRef = useRef(0);
  const lastTimeRef = useRef(0);
  const velocityYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const pendingDragRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);

  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [snapBack, setSnapBack] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  dragOffsetRef.current = dragOffset;
  isDraggingRef.current = isDragging;

  useEffect(() => {
    if (open) setHasOpened(true);
  }, [open]);

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

  useEffect(() => {
    if (open) return;
    setDragOffset(0);
    setIsDragging(false);
    setSnapBack(false);
    setIsDismissing(false);
    pendingDragRef.current = false;
    activePointerIdRef.current = null;
  }, [open]);

  const getDismissThreshold = useCallback(() => {
    const h = sheetRef.current?.offsetHeight ?? 400;
    return Math.max(DISMISS_DISTANCE_PX, h * DISMISS_FRACTION);
  }, []);

  const animateDismiss = useCallback(() => {
    const h = sheetRef.current?.offsetHeight ?? window.innerHeight;
    setSnapBack(false);
    setIsDragging(false);
    pendingDragRef.current = false;
    setIsDismissing(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setDragOffset(h));
    });
  }, []);

  useEffect(() => {
    if (!isDismissing) return;
    const el = sheetRef.current;
    if (!el) return;

    const finish = () => {
      setDragOffset(0);
      setIsDismissing(false);
      onClose();
    };

    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.target !== el || e.propertyName !== "transform") return;
      finish();
    };

    const fallback = window.setTimeout(finish, 400);
    el.addEventListener("transitionend", onTransitionEnd);
    return () => {
      window.clearTimeout(fallback);
      el.removeEventListener("transitionend", onTransitionEnd);
    };
  }, [isDismissing, onClose]);

  const isNoDragTarget = (target: EventTarget | null) =>
    target instanceof Element && target.closest("[data-sheet-no-drag]") !== null;

  const onPointerDownCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!open || isDismissing) return;
    if (e.button !== 0) return;
    if (isNoDragTarget(e.target)) return;

    pendingDragRef.current = true;
    activePointerIdRef.current = e.pointerId;
    dragStartYRef.current = e.clientY;
    dragStartXRef.current = e.clientX;
    dragStartOffsetRef.current = dragOffsetRef.current;
    lastYRef.current = e.clientY;
    lastTimeRef.current = performance.now();
    velocityYRef.current = 0;
    setSnapBack(false);
  };

  const onPointerMoveCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    if (!pendingDragRef.current && !isDraggingRef.current) return;

    const dy = e.clientY - dragStartYRef.current;
    const dx = e.clientX - dragStartXRef.current;

    if (!isDraggingRef.current) {
      if (dy <= 0) return;
      if (dy < DRAG_COMMIT_PX) return;
      if (dy < Math.abs(dx)) return;
      if (bodyRef.current && bodyRef.current.scrollTop > 0) {
        pendingDragRef.current = false;
        activePointerIdRef.current = null;
        return;
      }

      pendingDragRef.current = false;
      setIsDragging(true);
      sheetRef.current?.setPointerCapture(e.pointerId);
      e.preventDefault();
    }

    const now = performance.now();
    const next = Math.max(0, dragStartOffsetRef.current + dy);

    const dt = now - lastTimeRef.current;
    if (dt > 0) {
      velocityYRef.current = (e.clientY - lastYRef.current) / dt;
    }
    lastYRef.current = e.clientY;
    lastTimeRef.current = now;

    setDragOffset(next);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;

    const wasDragging = isDraggingRef.current;
    pendingDragRef.current = false;
    activePointerIdRef.current = null;

    if (sheetRef.current?.hasPointerCapture(e.pointerId)) {
      sheetRef.current.releasePointerCapture(e.pointerId);
    }

    if (!wasDragging) return;

    setIsDragging(false);
    const offset = dragOffsetRef.current;
    const threshold = getDismissThreshold();

    if (offset >= threshold || velocityYRef.current > DISMISS_VELOCITY_PX_MS) {
      animateDismiss();
      return;
    }

    if (offset > 0) {
      setSnapBack(true);
      setDragOffset(0);
      window.setTimeout(() => setSnapBack(false), 320);
    }
  };

  const onPointerCancelCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;

    pendingDragRef.current = false;
    activePointerIdRef.current = null;

    if (sheetRef.current?.hasPointerCapture(e.pointerId)) {
      sheetRef.current.releasePointerCapture(e.pointerId);
    }

    if (!isDraggingRef.current) return;

    setIsDragging(false);
    setSnapBack(true);
    setDragOffset(0);
    window.setTimeout(() => setSnapBack(false), 320);
  };

  if (typeof document === "undefined") return null;

  const state = open ? "open" : hasOpened ? "closed" : "idle";
  const isDragActive = isDragging || dragOffset > 0 || isDismissing;
  const sheetHeight = sheetRef.current?.offsetHeight ?? 480;
  const dragProgress = Math.min(1, dragOffset / sheetHeight);
  const scrimOpacity = open ? 1 - dragProgress * 0.55 : undefined;

  const sheetTransform =
    isDragActive && (dragOffset > 0 || isDismissing || snapBack || isDragging)
      ? `translate3d(0, ${dragOffset}px, 0)`
      : undefined;

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close player"
        onClick={onClose}
        data-state={state}
        className="audio-player-sheet-scrim fixed inset-0 z-[60]"
        style={
          isDragActive && open
            ? {
                opacity: scrimOpacity,
                transition: isDragging ? "none" : undefined,
              }
            : undefined
        }
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="false"
        aria-label={title}
        aria-hidden={!open}
        data-state={state}
        data-dragging={isDragging ? "true" : undefined}
        data-snap-back={snapBack ? "true" : undefined}
        data-dismissing={isDismissing ? "true" : undefined}
        className={cn(
          "audio-player-sheet fixed inset-x-0 bottom-0 z-[70] flex max-h-[min(88dvh,780px)] flex-col pb-[env(safe-area-inset-bottom,0px)]",
          isDragging && "cursor-grabbing",
          !isDragging && open && "cursor-grab",
        )}
        style={sheetTransform ? { transform: sheetTransform } : undefined}
        onPointerDownCapture={onPointerDownCapture}
        onPointerMoveCapture={onPointerMoveCapture}
        onPointerUpCapture={endDrag}
        onPointerCancelCapture={onPointerCancelCapture}
      >
        <div className="audio-player-sheet__chrome shrink-0" aria-hidden>
          <div className="audio-player-sheet__grabber" />
        </div>
        <div
          ref={bodyRef}
          className="audio-player-sheet__body min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
        >
          {children}
        </div>
      </div>
    </>,
    document.body,
  );
}
