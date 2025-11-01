/**
 * Article Reader Component
 * Mobile-optimized reading experience for articles with text highlighting
 */

"use client";

import { type Article } from "~/types/article";
import {
  type Highlight,
  type Note,
  type HighlightColor,
} from "~/types/annotation";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  getTextContent,
  offsetsToRange,
  extractPrefixSuffix,
  hashContent,
  reanchor,
} from "~/lib/anchoring";
import { HighlightPopover } from "./highlight-popover";
import { HighlightAnnotation } from "./highlight-annotation";

interface ArticleReaderProps {
  article: Article;
  highlights?: Highlight[];
  notes?: Note[];
  onHighlight?: (data: {
    text: string;
    startOffset: number;
    endOffset: number;
    color: HighlightColor;
    note?: string;
    tags?: string[];
    quoteExact?: string;
    quotePrefix?: string;
    quoteSuffix?: string;
    contentHash?: string;
  }) => void;
  onUpdateHighlight?: (
    id: string,
    data: { color?: HighlightColor; note?: string | null; tags?: string[] },
  ) => void;
  onDeleteHighlight?: (id: string) => void;
  onAddNote?: (content: string, highlightId?: string) => void;
  onBackClick?: () => void;
  onMarkAsRead?: () => void;
}

export function ArticleReader({
  article,
  highlights = [],
  notes = [],
  onHighlight,
  onUpdateHighlight,
  onDeleteHighlight,
  onAddNote,
  onBackClick,
  onMarkAsRead,
}: ArticleReaderProps) {
  const [selectedText, setSelectedText] = useState<{
    text: string;
    startOffset: number;
    endOffset: number;
    range: Range;
  } | null>(null);
  const [selectedHighlight, setSelectedHighlight] = useState<Highlight | null>(
    null,
  );
  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 });
  const [fontSize, setFontSize] = useState(16);
  const [showSettings, setShowSettings] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const highlightRegistryRef = useRef<Map<string, Range>>(new Map());
  const markedAsReadRef = useRef<string | null>(null);
  const onMarkAsReadRef = useRef(onMarkAsRead);

  // Keep ref updated with latest callback
  useEffect(() => {
    onMarkAsReadRef.current = onMarkAsRead;
  }, [onMarkAsRead]);

  useEffect(() => {
    // Only mark as read once per article, when article changes to an unread one
    if (
      !article.isRead &&
      onMarkAsReadRef.current &&
      markedAsReadRef.current !== article.id
    ) {
      markedAsReadRef.current = article.id;
      onMarkAsReadRef.current();
    }
    // Reset tracking when article changes (but don't reset if we just marked it)
    // This ensures we can mark new articles when navigating
    if (markedAsReadRef.current && markedAsReadRef.current !== article.id) {
      markedAsReadRef.current = null;
    }
  }, [article.id, article.isRead]);

  // Render highlights using CSS Custom Highlight API or DOM fallback
  useEffect(() => {
    console.log("Highlights effect running:", {
      hasContentRef: !!contentRef.current,
      highlightsLength: highlights.length,
      highlights,
    });

    if (!contentRef.current) {
      console.log("No contentRef, skipping highlight rendering");
      return;
    }

    if (highlights.length === 0) {
      console.log("No highlights to render");
      return;
    }

    // Wait for DOM to be ready after dangerouslySetInnerHTML
    const applyHighlights = () => {
      const root = contentRef.current;
      if (!root) {
        console.log("Root not found in applyHighlights");
        return;
      }

      // Find the actual content element (the inner div with the HTML)
      const contentElement = root.querySelector("div") || root;
      console.log("Applying highlights to element:", contentElement, {
        textLength: getTextContent(contentElement as HTMLElement).length,
        highlightCount: highlights.length,
      });

      const registry = highlightRegistryRef.current;
      registry.clear();

      // Clear existing highlights
      if (typeof CSS !== "undefined" && CSS.highlights) {
        CSS.highlights.clear();
      }

      // Remove any existing mark elements
      contentElement.querySelectorAll("[data-hl-id]").forEach((el) => {
        const parent = el.parentNode;
        if (parent) {
          parent.replaceChild(
            document.createTextNode(el.textContent ?? ""),
            el,
          );
          parent.normalize();
        }
      });

      highlights.forEach((highlight) => {
        console.log("Processing highlight:", highlight.id, {
          startOffset: highlight.startOffset,
          endOffset: highlight.endOffset,
          text: highlight.text.substring(0, 50),
        });

        // Try to re-anchor the highlight
        const reanchored = reanchor(contentElement as HTMLElement, highlight);
        if (!reanchored) {
          console.warn(`Failed to anchor highlight ${highlight.id}`, {
            original: {
              start: highlight.startOffset,
              end: highlight.endOffset,
            },
            text: highlight.text,
          });
          return;
        }

        const range = offsetsToRange(
          contentElement as HTMLElement,
          reanchored.startOffset,
          reanchored.endOffset,
        );
        if (!range) {
          console.warn(`Failed to create range for highlight ${highlight.id}`, {
            offsets: reanchored,
            text: highlight.text,
          });
          return;
        }

        console.log("Successfully created range for highlight:", highlight.id);

        registry.set(highlight.id, range);

        // Use DOM manipulation for highlighting (CSS Custom Highlight API not well supported)
        console.log("Using DOM fallback for highlight:", highlight.id);
        applyHighlightDOM(
          contentElement as HTMLElement,
          highlight.id,
          range,
          highlight.color,
        );
      });
    };

    // Use requestAnimationFrame for better timing with DOM updates
    requestAnimationFrame(() => {
      requestAnimationFrame(applyHighlights);
    });
  }, [highlights, article.content]);

  // Apply highlight via DOM manipulation (fallback)
  const applyHighlightDOM = (
    root: HTMLElement,
    highlightId: string,
    range: Range,
    color: HighlightColor,
  ) => {
    try {
      // Validate range
      if (!range || range.collapsed) {
        console.error("Invalid range for highlight:", highlightId);
        return;
      }

      const mark = document.createElement("mark");
      mark.setAttribute("data-hl-id", highlightId);
      mark.className = `highlight-${color} cursor-pointer`;
      mark.style.backgroundColor = getHighlightColor(color);
      mark.style.color = "inherit";
      mark.style.padding = "2px 0";
      mark.style.borderRadius = "2px";

      mark.addEventListener("click", (e) => {
        e.stopPropagation();
        const highlight = highlights.find((h) => h.id === highlightId);
        if (highlight) {
          setSelectedHighlight(highlight);
        }
      });

      try {
        // Try surroundContents first (works for simple ranges)
        range.surroundContents(mark);
        console.log(
          "Successfully wrapped highlight with surroundContents:",
          highlightId,
        );
      } catch (error) {
        // If surroundContents fails, manually wrap nodes
        console.log("surroundContents failed, using manual wrapping:", error);

        // Extract contents and wrap them
        const contents = range.extractContents();

        // Clone the mark to avoid issues
        const clonedMark = mark.cloneNode(false) as HTMLElement;
        clonedMark.appendChild(contents);

        // Insert the mark at the start position
        range.insertNode(clonedMark);

        // If there's leftover content, we need to handle it
        // The range should now be collapsed at the end of the mark
        range.collapse(false);

        console.log(
          "Successfully wrapped highlight with manual method:",
          highlightId,
        );
      }
    } catch (error) {
      console.error("Failed to apply highlight via DOM:", error, {
        highlightId,
        range: range
          ? {
              startContainer: range.startContainer,
              startOffset: range.startOffset,
              endContainer: range.endContainer,
              endOffset: range.endOffset,
            }
          : null,
      });
    }
  };

  const getHighlightColor = (color: HighlightColor): string => {
    // Dark mode compatible highlight colors with good contrast
    const colors: Record<HighlightColor, string> = {
      yellow: "#fbbf24", // Amber 400 - brighter for dark mode
      green: "#34d399", // Emerald 400
      blue: "#60a5fa", // Blue 400
      pink: "#f472b6", // Pink 400
      purple: "#a78bfa", // Violet 400
      orange: "#fb923c", // Orange 400
      red: "#f87171", // Red 400
      gray: "#9ca3af", // Gray 400
    };
    return colors[color] ?? colors.yellow;
  };

  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !contentRef.current) {
      setSelectedText(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const selectedText = selection.toString().trim();

    if (selectedText.length < 3) {
      setSelectedText(null);
      return;
    }

    // Find the actual content element (the inner div with the HTML)
    const contentElement =
      contentRef.current.querySelector("div") || contentRef.current;

    // Check if selection is within content area
    if (!contentElement.contains(range.commonAncestorContainer)) {
      return;
    }

    // Calculate offsets relative to content
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(contentElement);
    preCaretRange.setEnd(range.startContainer, range.startOffset);
    const startOffset = preCaretRange.toString().length;
    const endOffset = startOffset + selectedText.length;

    // Get selection position for popover
    const rect = range.getBoundingClientRect();
    const popoverX = rect.left + rect.width / 2;
    const popoverY = rect.top;

    setSelectedText({
      text: selectedText,
      startOffset,
      endOffset,
      range: range.cloneRange(),
    });
    setPopoverPosition({ x: popoverX, y: popoverY });
  }, []);

  const handleHighlightCreate = useCallback(
    (data: { color: HighlightColor; note?: string; tags?: string[] }) => {
      if (!selectedText || !onHighlight || !contentRef.current) return;

      // Find the actual content element (the inner div with the HTML)
      const contentElement =
        contentRef.current.querySelector("div") || contentRef.current;
      const { prefix, suffix } = extractPrefixSuffix(
        contentElement as HTMLElement,
        selectedText.range,
      );
      const contentHash = hashContent(
        getTextContent(contentElement as HTMLElement),
      );

      onHighlight({
        text: selectedText.text,
        startOffset: selectedText.startOffset,
        endOffset: selectedText.endOffset,
        color: data.color,
        note: data.note,
        tags: data.tags,
        quoteExact: selectedText.text,
        quotePrefix: prefix,
        quoteSuffix: suffix,
        contentHash,
      });

      setSelectedText(null);
      window.getSelection()?.removeAllRanges();
    },
    [selectedText, onHighlight],
  );

  const handleCancelSelection = useCallback(() => {
    setSelectedText(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  // Keyboard shortcut: Cmd/Ctrl+Shift+H
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key === "H" &&
        window.getSelection()?.toString().trim()
      ) {
        e.preventDefault();
        handleTextSelection();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleTextSelection]);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatReadingTime = (minutes: number) => {
    if (minutes < 1) return "< 1 min read";
    return `${minutes} min read`;
  };

  const getDomainFromUrl = (url: string) => {
    try {
      return new URL(url).hostname.replace("www.", "");
    } catch {
      return url;
    }
  };

  // Filter notes by highlight
  const getNotesForHighlight = (highlightId: string) => {
    return notes.filter((note) => note.highlightId === highlightId);
  };

  return (
    <div className="flex h-full flex-col bg-gray-900">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-700 bg-gray-900 px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={onBackClick}
            className="flex items-center text-gray-400 hover:text-gray-200"
          >
            <svg
              className="mr-1 h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back
          </button>

          <div className="flex items-center space-x-2">
            {/* Reading settings */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
              aria-label="Reading settings"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>

            {/* Share button */}
            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: article.title,
                    url: article.url,
                  });
                } else {
                  navigator.clipboard.writeText(article.url);
                }
              }}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
              aria-label="Share article"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="mt-3 rounded-lg bg-gray-800 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-200">
                Font Size
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setFontSize(Math.max(12, fontSize - 2))}
                  className="p-1 text-gray-400 hover:text-gray-200"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M20 12H4"
                    />
                  </svg>
                </button>
                <span className="w-8 text-center text-sm text-gray-300">
                  {fontSize}
                </span>
                <button
                  onClick={() => setFontSize(Math.min(24, fontSize + 2))}
                  className="p-1 text-gray-400 hover:text-gray-200"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Article content */}
      <div className="flex-1 overflow-y-auto">
        <article className="max-w-none px-4 py-6">
          {/* Article metadata */}
          <div className="mb-6">
            <div className="mb-2 flex items-center text-sm text-gray-400">
              <span>{getDomainFromUrl(article.url)}</span>
              {article.publishedAt && (
                <>
                  <span className="mx-2">•</span>
                  <span>{formatDate(article.publishedAt)}</span>
                </>
              )}
              {article.readingTime && (
                <>
                  <span className="mx-2">•</span>
                  <span>{formatReadingTime(article.readingTime)}</span>
                </>
              )}
            </div>

            <h1 className="mb-4 text-2xl leading-tight font-bold text-gray-100">
              {article.title}
            </h1>

            {article.author && (
              <p className="mb-4 text-gray-300">By {article.author}</p>
            )}

            {article.tags && article.tags.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {article.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full bg-blue-900/50 px-2 py-1 text-xs font-medium text-blue-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Article content */}
          <div
            ref={contentRef}
            className="article-content max-w-none leading-relaxed"
            style={{ fontSize: `${fontSize}px`, lineHeight: 1.6 }}
            onMouseUp={handleTextSelection}
            onTouchEnd={handleTextSelection}
            onClick={(e) => {
              // Check if clicking on a highlight
              const target = e.target as HTMLElement;
              const hlId =
                target.getAttribute("data-hl-id") ??
                target.closest("[data-hl-id]")?.getAttribute("data-hl-id");
              if (hlId) {
                const highlight = highlights.find((h) => h.id === hlId);
                if (highlight) {
                  setSelectedHighlight(highlight);
                }
              } else {
                setSelectedHighlight(null);
              }
            }}
          >
            <div dangerouslySetInnerHTML={{ __html: article.content }} />
          </div>

          {/* Standalone notes section */}
          {notes.filter((n) => !n.highlightId).length > 0 && (
            <div className="mt-8 border-t border-gray-700 pt-6">
              <h3 className="mb-4 text-lg font-semibold text-gray-100">
                Notes
              </h3>
              <div className="space-y-3">
                {notes
                  .filter((n) => !n.highlightId)
                  .map((note) => (
                    <div
                      key={note.id}
                      className="rounded-r border-l-4 border-yellow-600 bg-yellow-900/30 p-3"
                    >
                      <p className="text-sm text-gray-200">{note.content}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        {formatDate(note.createdAt)}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </article>
      </div>

      {/* Highlight popover */}
      {selectedText && (
        <HighlightPopover
          selectedText={selectedText.text}
          position={popoverPosition}
          onHighlight={handleHighlightCreate}
          onCancel={handleCancelSelection}
        />
      )}

      {/* Highlight annotation dialog */}
      {selectedHighlight && (
        <div className="bg-opacity-70 fixed inset-0 z-50 flex items-center justify-center bg-black p-4">
          <div className="w-full max-w-2xl rounded-lg border border-gray-700 bg-gray-800 p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-100">
                Highlight Details
              </h3>
              <button
                onClick={() => setSelectedHighlight(null)}
                className="text-gray-400 hover:text-gray-200"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <HighlightAnnotation
              highlight={selectedHighlight}
              notes={getNotesForHighlight(selectedHighlight.id)}
              onUpdateHighlight={onUpdateHighlight}
              onDeleteHighlight={(id) => {
                onDeleteHighlight?.(id);
                setSelectedHighlight(null);
              }}
              onAddNote={onAddNote}
            />
          </div>
        </div>
      )}

      {/* CSS for highlights - dark mode optimized */}
      <style jsx global>{`
        @supports (background-color: Highlight) {
          mark[data-hl-id] {
            background-color: Highlight;
            color: HighlightText;
          }
        }
        .highlight-yellow {
          background-color: #fbbf24;
          color: #1f2937;
        }
        .highlight-green {
          background-color: #34d399;
          color: #1f2937;
        }
        .highlight-blue {
          background-color: #60a5fa;
          color: #1f2937;
        }
        .highlight-pink {
          background-color: #f472b6;
          color: #1f2937;
        }
        .highlight-purple {
          background-color: #a78bfa;
          color: #1f2937;
        }
        .highlight-orange {
          background-color: #fb923c;
          color: #1f2937;
        }
        .highlight-red {
          background-color: #f87171;
          color: #1f2937;
        }
        .highlight-gray {
          background-color: #9ca3af;
          color: #1f2937;
        }
      `}</style>
    </div>
  );
}
