"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Minus,
  Plus,
  ZoomIn,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import {
  pdfDocumentOptions,
  pdfWorkerSrc,
} from "~/lib/pdf-document-options";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.15;

export interface PdfViewerProps {
  streamUrl: string;
  originalUrl?: string;
  title?: string;
  header?: ReactNode;
  className?: string;
  onProgressChange?: (percent: number) => void;
}

export function PdfViewer({
  streamUrl,
  originalUrl,
  title,
  header,
  className,
  onProgressChange,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageInput, setPageInput] = useState("1");

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPageNumber(1);
    setPageInput("1");
    setNumPages(0);
    setLoadError(null);
  }, [streamUrl]);

  useEffect(() => {
    setPageInput(String(pageNumber));
    if (numPages > 0) {
      onProgressChange?.((pageNumber / numPages) * 100);
    }
  }, [pageNumber, numPages, onProgressChange]);

  const goToPage = useCallback(
    (nextPage: number) => {
      if (numPages <= 0) return;
      const clamped = Math.min(numPages, Math.max(1, nextPage));
      setPageNumber(clamped);
    },
    [numPages],
  );

  const adjustScale = useCallback((delta: number) => {
    setScale((current) =>
      Math.min(MAX_SCALE, Math.max(MIN_SCALE, current + delta)),
    );
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        goToPage(pageNumber - 1);
      } else if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        goToPage(pageNumber + 1);
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        adjustScale(SCALE_STEP);
      } else if (event.key === "-") {
        event.preventDefault();
        adjustScale(-SCALE_STEP);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [adjustScale, goToPage, pageNumber]);

  const handlePageInputCommit = () => {
    const parsed = Number.parseInt(pageInput, 10);
    if (Number.isNaN(parsed)) {
      setPageInput(String(pageNumber));
      return;
    }
    goToPage(parsed);
  };

  const fallbackUrl = originalUrl ?? streamUrl;

  if (loadError) {
    return (
      <div className="rounded-2xl border border-rule bg-surface px-6 py-10 text-center shadow-[var(--shadow-soft)]">
        <p className="text-sm text-foreground-soft">{loadError}</p>
        {fallbackUrl && (
          <Button asChild className="mt-4 rounded-full px-5">
            <a href={fallbackUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
              Open original PDF
            </a>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="border-rule bg-surface z-10 flex flex-shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border px-3 py-2 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => goToPage(pageNumber - 1)}
            disabled={pageNumber <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1.5 text-sm text-foreground-soft">
            <input
              type="text"
              inputMode="numeric"
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
              onBlur={handlePageInputCommit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handlePageInputCommit();
                  (event.target as HTMLInputElement).blur();
                }
              }}
              aria-label="Current page"
              className="border-rule bg-background h-8 w-12 rounded-lg border text-center text-sm text-foreground"
            />
            <span>/ {numPages || "—"}</span>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => goToPage(pageNumber + 1)}
            disabled={numPages > 0 && pageNumber >= numPages}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => adjustScale(-SCALE_STEP)}
            disabled={scale <= MIN_SCALE}
            aria-label="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="min-w-[3rem] text-center text-xs text-foreground-soft">
            {Math.round(scale * 100)}%
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => adjustScale(SCALE_STEP)}
            disabled={scale >= MAX_SCALE}
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => setScale(1)}
            aria-label="Reset zoom"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>

          {originalUrl && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="ml-1 rounded-full"
            >
              <a
                href={originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={title ? `Open ${title}` : "Open original PDF"}
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Original
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {header ? <div className="mb-6 pt-6">{header}</div> : null}

        <div
          ref={containerRef}
          className="flex min-h-[480px] justify-center overflow-x-auto rounded-2xl border border-rule bg-background-deep/40 p-4"
        >
        <Document
          file={streamUrl}
          options={pdfDocumentOptions}
          loading={
            <div className="flex min-h-[420px] items-center justify-center gap-2 text-sm text-foreground-soft">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              Loading PDF…
            </div>
          }
          onLoadSuccess={({ numPages: loadedPages }) => {
            setNumPages(loadedPages);
            setLoadError(null);
          }}
          onLoadError={(error) => {
            console.error("PDF load error", error);
            setLoadError(
              "Couldn't load this PDF in the app. Try opening the original file instead.",
            );
          }}
          className={cn("flex justify-center")}
        >
          {containerWidth > 0 && (
            <Page
              pageNumber={pageNumber}
              width={Math.floor(containerWidth * scale)}
              devicePixelRatio={
                typeof window !== "undefined" ? window.devicePixelRatio : 1
              }
              renderTextLayer
              renderAnnotationLayer
              loading={
                <div className="flex h-[420px] items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-foreground-soft" />
                </div>
              }
            />
          )}
        </Document>
        </div>
      </div>
    </div>
  );
}
