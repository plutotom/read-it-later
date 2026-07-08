"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Minus,
  Plus,
  ScanText,
  ScrollText,
  ZoomIn,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { pdfDocumentOptions, pdfWorkerSrc } from "~/lib/pdf-document-options";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.15;
const PDF_PAGE_STORAGE_PREFIX = "ril:pdf-page:";

export interface PdfViewerProps {
  streamUrl: string;
  originalUrl?: string;
  title?: string;
  header?: ReactNode;
  extractedText?: string;
  readingPositionKey?: string;
  className?: string;
  onProgressChange?: (percent: number) => void;
}

function readStoredPage(key: string, numPages: number): number | null {
  try {
    const raw = window.localStorage.getItem(`${PDF_PAGE_STORAGE_PREFIX}${key}`);
    if (!raw) return null;

    const page = Number.parseInt(raw, 10);
    if (Number.isNaN(page)) return null;

    return Math.min(numPages, Math.max(1, page));
  } catch {
    return null;
  }
}

function writeStoredPage(key: string, pageNumber: number, numPages: number) {
  try {
    const page = Math.min(numPages, Math.max(1, pageNumber));
    window.localStorage.setItem(
      `${PDF_PAGE_STORAGE_PREFIX}${key}`,
      String(page),
    );
  } catch {
    // Best-effort only. Private browsing or storage limits should not break PDF reading.
  }
}

export function PdfViewer({
  streamUrl,
  originalUrl,
  title,
  header,
  extractedText,
  readingPositionKey,
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
  const hasExtractedText = Boolean(extractedText?.trim());
  const [viewMode, setViewMode] = useState<"pdf" | "text">("pdf");
  const storageKey = readingPositionKey ?? streamUrl;
  const [renderedPage, setRenderedPage] = useState<{
    pageNumber: number;
    width: number;
  } | null>(null);
  const pendingRenderRef = useRef<{ pageNumber: number; width: number } | null>(
    null,
  );

  useEffect(() => {
    if (viewMode !== "pdf") return;

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
  }, [viewMode]);

  useEffect(() => {
    setPageNumber(1);
    setPageInput("1");
    setNumPages(0);
    setLoadError(null);
    setViewMode("pdf");
    setRenderedPage(null);
    pendingRenderRef.current = null;
  }, [streamUrl]);

  useEffect(() => {
    setPageInput(String(pageNumber));
    if (numPages > 0) {
      onProgressChange?.((pageNumber / numPages) * 100);
    }
  }, [pageNumber, numPages, onProgressChange]);

  useEffect(() => {
    if (numPages <= 0) return;
    writeStoredPage(storageKey, pageNumber, numPages);
  }, [storageKey, pageNumber, numPages]);

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
      if (viewMode !== "pdf") return;

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
  }, [adjustScale, goToPage, pageNumber, viewMode]);

  const handlePageInputCommit = () => {
    const parsed = Number.parseInt(pageInput, 10);
    if (Number.isNaN(parsed)) {
      setPageInput(String(pageNumber));
      return;
    }
    goToPage(parsed);
  };

  const fallbackUrl = originalUrl ?? streamUrl;
  const pageWidth =
    containerWidth > 0
      ? Math.floor(Math.max(280, (containerWidth - 32) * scale))
      : 0;
  const needsPageRender =
    pageWidth > 0 &&
    (renderedPage?.pageNumber !== pageNumber ||
      renderedPage?.width !== pageWidth);

  useEffect(() => {
    pendingRenderRef.current = needsPageRender
      ? { pageNumber, width: pageWidth }
      : null;
  }, [needsPageRender, pageNumber, pageWidth]);

  const handlePendingPageRendered = () => {
    const pending = pendingRenderRef.current;
    if (pending?.pageNumber !== pageNumber || pending?.width !== pageWidth) {
      return;
    }

    setRenderedPage(pending);
    pendingRenderRef.current = null;
  };

  if (loadError) {
    return (
      <div className="border-rule bg-surface rounded-2xl border px-6 py-10 text-center shadow-[var(--shadow-soft)]">
        <p className="text-foreground-soft text-sm">{loadError}</p>
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
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="bg-background/80 sticky top-0 z-20 pb-3 backdrop-blur-xl">
          <div className="border-rule bg-surface/95 flex flex-wrap items-center justify-between gap-2 rounded-[1.35rem] border px-2.5 py-2 shadow-[var(--shadow-soft)]">
            <div className="flex min-w-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={() => goToPage(pageNumber - 1)}
                disabled={pageNumber <= 1 || viewMode !== "pdf"}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>

              <div className="bg-background-deep/80 border-rule text-foreground-soft flex items-center gap-1.5 rounded-full border px-2 py-1 text-sm">
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
                  disabled={viewMode !== "pdf"}
                  aria-label="Current page"
                  className="bg-background text-foreground h-8 w-12 rounded-full text-center text-sm font-medium outline-none"
                />
                <span className="pr-1 whitespace-nowrap">
                  / {numPages || "—"}
                </span>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={() => goToPage(pageNumber + 1)}
                disabled={
                  viewMode !== "pdf" || (numPages > 0 && pageNumber >= numPages)
                }
                aria-label="Next page"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            {hasExtractedText && (
              <div className="border-rule bg-background-deep/80 order-3 grid w-full grid-cols-2 rounded-full border p-1 sm:order-none sm:w-auto">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-pressed={viewMode === "pdf"}
                  onClick={() => setViewMode("pdf")}
                  className={cn(
                    "h-8 rounded-full px-3",
                    viewMode === "pdf"
                      ? "bg-surface text-foreground shadow-soft"
                      : "text-foreground-soft hover:text-foreground hover:bg-transparent",
                  )}
                >
                  <ScanText className="h-3.5 w-3.5" />
                  PDF
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-pressed={viewMode === "text"}
                  onClick={() => setViewMode("text")}
                  className={cn(
                    "h-8 rounded-full px-3",
                    viewMode === "text"
                      ? "bg-surface text-foreground shadow-soft"
                      : "text-foreground-soft hover:text-foreground hover:bg-transparent",
                  )}
                >
                  <ScrollText className="h-3.5 w-3.5" />
                  Text
                </Button>
              </div>
            )}

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={() => adjustScale(-SCALE_STEP)}
                disabled={scale <= MIN_SCALE || viewMode !== "pdf"}
                aria-label="Zoom out"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="text-foreground-soft min-w-[3rem] text-center text-xs font-medium">
                {Math.round(scale * 100)}%
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={() => adjustScale(SCALE_STEP)}
                disabled={scale >= MAX_SCALE || viewMode !== "pdf"}
                aria-label="Zoom in"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="hidden h-10 w-10 rounded-full sm:inline-flex"
                onClick={() => setScale(1)}
                disabled={viewMode !== "pdf"}
                aria-label="Reset zoom"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>

              {originalUrl && (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="border-rule bg-background-deep/70 ml-1 h-10 rounded-full px-3"
                >
                  <a
                    href={originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={title ? `Open ${title}` : "Open original PDF"}
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline">Original</span>
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>

        {header ? (
          <div className="mx-auto mb-6 max-w-[760px] pt-6">{header}</div>
        ) : null}

        {viewMode === "text" && hasExtractedText ? (
          <div className="border-rule bg-surface mx-auto max-w-[760px] rounded-[1.5rem] border px-5 py-6 shadow-[var(--shadow-soft)] sm:px-8 sm:py-8">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-muted-foreground text-xs tracking-[0.18em] uppercase">
                  Extracted text
                </p>
                <h3
                  className="text-foreground mt-1 text-2xl font-medium tracking-tight"
                  style={{ fontFamily: "var(--font-app-display)" }}
                >
                  Reader-friendly text layer
                </h3>
              </div>
            </div>
            <p className="text-foreground-soft mb-6 text-sm leading-relaxed">
              Parsed from the PDF for search, listening, and export. Formatting
              can differ from the original document.
            </p>
            <div
              className="text-foreground text-[17px] leading-8 whitespace-pre-wrap"
              style={{ fontFamily: "var(--font-app-reading)" }}
            >
              {extractedText}
            </div>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="border-rule relative flex min-h-[68vh] justify-center overflow-x-auto rounded-[1.75rem] border bg-[radial-gradient(circle_at_50%_0%,color-mix(in_oklch,var(--accent)_18%,transparent),transparent_42%),linear-gradient(180deg,var(--background-deep),color-mix(in_oklch,var(--background)_88%,black))] p-3 shadow-[var(--shadow-soft)] sm:min-h-[72vh] sm:p-5"
          >
            <Document
              file={streamUrl}
              options={pdfDocumentOptions}
              loading={
                <div className="text-foreground-soft flex min-h-[420px] items-center justify-center gap-2 text-sm">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Loading PDF…
                </div>
              }
              onLoadSuccess={({ numPages: loadedPages }) => {
                const savedPage = readStoredPage(storageKey, loadedPages) ?? 1;
                setNumPages(loadedPages);
                setPageNumber(savedPage);
                setPageInput(String(savedPage));
                setLoadError(null);
              }}
              onLoadError={(error) => {
                console.error("PDF load error", error);
                setLoadError(
                  "Couldn't load this PDF in the app. Try opening the original file instead.",
                );
              }}
              className="flex justify-center"
            >
              <div className="relative min-h-[420px] min-w-[280px]">
                {renderedPage && (
                  <Page
                    key={`visible-${renderedPage.pageNumber}-${renderedPage.width}`}
                    pageNumber={renderedPage.pageNumber}
                    width={renderedPage.width}
                    devicePixelRatio={
                      typeof window !== "undefined"
                        ? window.devicePixelRatio
                        : 1
                    }
                    renderTextLayer
                    renderAnnotationLayer
                    loading={null}
                    className="overflow-hidden rounded-xl bg-[rgb(245,242,237)] shadow-[0_24px_70px_rgba(0,0,0,0.32)]"
                  />
                )}

                {needsPageRender && (
                  <Page
                    key={`pending-${pageNumber}-${pageWidth}`}
                    pageNumber={pageNumber}
                    width={pageWidth}
                    devicePixelRatio={
                      typeof window !== "undefined"
                        ? window.devicePixelRatio
                        : 1
                    }
                    renderTextLayer
                    renderAnnotationLayer
                    onRenderSuccess={handlePendingPageRendered}
                    loading={
                      renderedPage ? null : (
                        <div className="flex h-[420px] min-w-[280px] items-center justify-center">
                          <Loader2 className="text-foreground-soft h-5 w-5 animate-spin" />
                        </div>
                      )
                    }
                    className={cn(
                      "overflow-hidden rounded-xl bg-[rgb(245,242,237)] shadow-[0_24px_70px_rgba(0,0,0,0.32)]",
                      renderedPage &&
                        "pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 opacity-0",
                    )}
                  />
                )}

                {renderedPage && needsPageRender && (
                  <div className="pointer-events-none absolute right-3 bottom-3 rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white/80 backdrop-blur-md">
                    Rendering…
                  </div>
                )}
              </div>
            </Document>
          </div>
        )}
      </div>
    </div>
  );
}
