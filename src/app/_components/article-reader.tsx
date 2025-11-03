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

interface ArticleReaderProps {
  article: Article;
  onBackClick?: () => void;
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
  onBackClick,
  onMarkAsRead,
  initialHighlights = [],
  initialNotes = [],
  onHighlightCreate,
  onHighlightDelete,
  onHighlightNoteUpdate,
  onAttachNoteToHighlight,
}: ArticleReaderProps) {
  const [fontSize, setFontSize] = useState(16);
  const [showSettings, setShowSettings] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const markedAsReadRef = useRef<string | null>(null);
  const onMarkAsReadRef = useRef(onMarkAsRead);

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

  const [selectedText, setSelectedText] = useState<{
    text: string;
    startOffset: number;
    endOffset: number;
    range: Range;
  } | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

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
      contentRef.current?.querySelector("div") || contentRef.current;

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

  const handleTextSelection = useCallback(async () => {
    if (!autoHighlight) return;
    const selection = window.getSelection();
    console.log("selection", selection);
    if (!selection || selection.isCollapsed || !contentRef.current) {
      setSelectedText(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const selectionString = selection.toString();
    const selectedText = selectionString.trim();

    if (selectedText.length < 3) {
      setSelectedText(null);
      return;
    }

    const contentElement =
      contentRef.current.querySelector("div") || contentRef.current;

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

    // Get selection position for popover (before clearing)
    const rect = range.getBoundingClientRect();
    const popoverX = rect.left + rect.width / 2;
    const popoverY = rect.top;

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
        contextPrefix: contextPrefix || undefined,
        contextSuffix: contextSuffix || undefined,
      });
    }

    // Clear the selection
    if (selection.removeAllRanges) {
      selection.removeAllRanges();
    }

    setSelectedText({
      text: selectedText,
      startOffset,
      endOffset,
      range: range.cloneRange(),
    });
    setPopoverPosition({ x: popoverX, y: popoverY });
  }, [autoHighlight]);

  const onTextSelection = useCallback(() => {
    handleTextSelection();
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

  return (
    <div className="flex h-full flex-col bg-gray-900">
      <ArticleReaderHeader
        article={article}
        onBackClick={onBackClick}
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

      <div className="flex-1 overflow-y-auto">
        <article className="max-w-none px-4 py-6">
          <ArticleMetadata article={article} />
          <StandaloneNotes
            notes={initialNotes}
            highlights={initialHighlights}
            onAttachToHighlight={onAttachNoteToHighlight}
          />
          <ArticleContent
            content={article.content}
            fontSize={fontSize}
            contentRef={contentRef}
            onTextSelection={onTextSelection}
          />
        </article>
      </div>

      {/* <HighlightStyles /> */}
    </div>
  );
}
