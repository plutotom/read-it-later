/**
 * Article Reader Component
 * Mobile-optimized reading experience for articles with text highlighting
 */

"use client";

import { type Article } from "~/types/article";
import { type Highlight, type Note } from "~/types/annotation";
import { useState, useRef, useEffect, useCallback } from "react";
import { ArticleReaderHeader } from "./article-reader-header";
import { ArticleMetadata } from "./article-metadata";
import { ArticleContent } from "./article-content";
import { StandaloneNotes } from "./standalone-notes";
import { applyHighlights, type HighlightData } from "~/lib/highlihgter-util";
import { AudioPlayer } from "./audio-player";

interface ArticleReaderProps {
  article: Article;
  onMarkAsRead?: () => void;
  initialHighlights?: Highlight[];
  initialNotes?: Note[];
  onHighlightCreate?: (data: {
    text: string;
    startOffset: number;
    endOffset: number;
    color: string;
    contextPrefix?: string;
    contextSuffix?: string;
  }) => void;
  onHighlightDelete?: (highlightId: string) => void;
  onHighlightNoteUpdate?: (highlightId: string, note: string | null) => void;
  onAttachNoteToHighlight?: (noteId: string, highlightId: string) => void;
}

export function ArticleReader({
  article,
  onMarkAsRead,
  initialHighlights = [],
  initialNotes = [],
  onHighlightCreate,
  onHighlightDelete,
  onHighlightNoteUpdate,
  onAttachNoteToHighlight,
}: ArticleReaderProps) {
  const [fontSize, setFontSize] = useState(19);
  const [showSettings, setShowSettings] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const markedAsReadRef = useRef<string | null>(null);
  const onMarkAsReadRef = useRef(onMarkAsRead);
  const [progress, setProgress] = useState(0);

  // Convert Highlight[] to HighlightData[] for internal use
  const convertHighlightsToHighlightData = useCallback(
    (highlights: Highlight[]): HighlightData[] => {
      return highlights.map((h, index) => ({
        text: h.text,
        startOffset: h.startOffset,
        endOffset: h.endOffset,
        color: h.color,
        textColor: "black", // Default text color
        highlightIndex: index,
      }));
    },
    [],
  );

  // Store highlights in state, initialized with loaded highlights
  const [highlights, setHighlights] = useState<HighlightData[]>(() => {
    return initialHighlights.map((h, index) => ({
      text: h.text,
      startOffset: h.startOffset,
      endOffset: h.endOffset,
      color: h.color,
      textColor: "black",
      highlightIndex: index,
    }));
  });

  // Auto highlight preference stored in localStorage
  const [autoHighlight, setAutoHighlight] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("autoHighlight");
      return stored !== null ? stored === "true" : true; // Default to true
    }
    return true;
  });

  // Keep ref updated with latest callback
  useEffect(() => {
    onMarkAsReadRef.current = onMarkAsRead;
  }, [onMarkAsRead]);

  // Mark article as read when it changes to unread
  useEffect(() => {
    if (
      !article.isRead &&
      onMarkAsReadRef.current &&
      markedAsReadRef.current !== article.id
    ) {
      markedAsReadRef.current = article.id;
      onMarkAsReadRef.current();
    }
    if (markedAsReadRef.current && markedAsReadRef.current !== article.id) {
      markedAsReadRef.current = null;
    }
  }, [article.id, article.isRead]);

  // Apply highlights to DOM after React renders
  // This effect runs whenever content, highlights, or fontSize changes
  useEffect(() => {
    const contentElement =
      contentRef.current?.querySelector("div") ?? contentRef.current;

    if (!contentElement || !(contentElement instanceof HTMLElement)) {
      return;
    }

    // Use a small delay to ensure React has finished rendering
    // This is necessary because dangerouslySetInnerHTML happens synchronously,
    // but we need the DOM to be fully populated
    const timeoutId = setTimeout(() => {
      applyHighlights(contentElement, highlights);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [article.content, highlights, fontSize]);

  const handleTextSelection = useCallback(() => {
    if (!autoHighlight) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !contentRef.current) {
      return;
    }

    const range = selection.getRangeAt(0);
    const selectionString = selection.toString();
    const selectedText = selectionString.trim();

    if (selectedText.length < 3) {
      return;
    }

    const contentElement =
      contentRef.current.querySelector("div") ?? contentRef.current;

    if (!contentElement.contains(range.commonAncestorContainer)) {
      return;
    }

    if (!selectionString) return;

    // Calculate offsets relative to content
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(contentElement);
    preCaretRange.setEnd(range.startContainer, range.startOffset);
    const startOffset = preCaretRange.toString().length;
    const endOffset = startOffset + selectionString.length;

    // Extract context for disambiguation (30 characters before and after)
    const fullText = contentElement.textContent ?? "";
    const contextPrefix = fullText
      .slice(Math.max(0, startOffset - 30), startOffset)
      .trim();
    const contextSuffix = fullText
      .slice(endOffset, Math.min(fullText.length, endOffset + 30))
      .trim();

    // Create highlight object and add to state
    // Use functional update to get the current length without needing it in dependencies
    setHighlights((prev) => {
      const newHighlight: HighlightData = {
        text: selectionString, // Use full selection string including whitespace for accurate offsets
        startOffset,
        endOffset,
        color: "yellow",
        textColor: "black",
        highlightIndex: prev.length,
      };
      return [...prev, newHighlight];
    });

    // Save highlight to database
    if (onHighlightCreate) {
      onHighlightCreate({
        text: selectionString,
        startOffset,
        endOffset,
        color: "yellow",
        contextPrefix: contextPrefix === "" ? undefined : contextPrefix,
        contextSuffix: contextSuffix === "" ? undefined : contextSuffix,
      });
    }

    // Clear the selection
    if (selection.removeAllRanges) {
      selection.removeAllRanges();
    }
  }, [autoHighlight, onHighlightCreate]);

  const onTextSelection = useCallback(() => {
    void handleTextSelection();
  }, [handleTextSelection]);

  // Reset and reload highlights when article changes
  useEffect(() => {
    setHighlights(convertHighlightsToHighlightData(initialHighlights));
  }, [article.id, initialHighlights, convertHighlightsToHighlightData]);

  // Save auto highlight preference to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("autoHighlight", String(autoHighlight));
    }
  }, [autoHighlight]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? (el.scrollTop / max) * 100 : 0);
    };

    onScroll();
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [article.id]);

  return (
    <div className="bg-foreground/30 min-h-screen backdrop-blur-[4px]">
      <div className="ml-auto flex min-h-screen w-full max-w-[880px] flex-col bg-background shadow-[var(--shadow-strong)] m-slide-in">
        <ArticleReaderHeader
          article={article}
          showSettings={showSettings}
          onToggleSettings={() => setShowSettings(!showSettings)}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          autoHighlight={autoHighlight}
          onAutoHighlightChange={setAutoHighlight}
          highlights={initialHighlights}
          onHighlightDelete={onHighlightDelete}
          onHighlightNoteUpdate={onHighlightNoteUpdate}
        />

        <div className="h-[2px] bg-background-deep">
          <div
            className="h-full bg-accent transition-[width] duration-150 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div
          ref={scrollerRef}
          className="relative flex-1 overflow-y-auto px-5 pt-8 pb-36 sm:px-8 sm:pt-12"
        >
          <article className="mx-auto max-w-[640px]">
            <ArticleMetadata article={article} />

            {initialNotes.length > 0 && (
              <div className="mb-8 rounded-2xl border border-rule bg-surface p-4 shadow-[var(--shadow-soft)]">
                <StandaloneNotes
                  notes={initialNotes}
                  highlights={initialHighlights}
                  onAttachToHighlight={onAttachNoteToHighlight}
                />
              </div>
            )}

            <ArticleContent
              content={article.content}
              fontSize={fontSize}
              contentRef={contentRef}
              onTextSelection={onTextSelection}
            />
          </article>

          <div className="pointer-events-none absolute right-5 bottom-5 left-5 sm:right-6 sm:bottom-6 sm:left-6">
            <div className="pointer-events-auto">
              <AudioPlayer articleId={article.id} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
