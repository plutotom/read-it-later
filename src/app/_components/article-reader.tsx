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
import { applyHighlightsToDOM } from "~/lib/highlight-renderer";
import { HighlightPopover } from "./highlight-popover";
import { ArticleReaderHeader } from "./article-reader-header";
import { ArticleMetadata } from "./article-metadata";
import { ArticleContent } from "./article-content";
import { StandaloneNotes } from "./standalone-notes";
import { HighlightDialog } from "./highlight-dialog";
import { HighlightStyles } from "./highlight-styles";
import { useHighlightManagement } from "./use-highlight-management";
import highlight from "~/lib/highlihgter-util";

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
    contextPrefix?: string;
    contextSuffix?: string;
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
  const [autoHighlightEnabled, setAutoHighlightEnabled] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const markedAsReadRef = useRef<string | null>(null);
  const onMarkAsReadRef = useRef(onMarkAsRead);

  const { handleHighlightCreate: createHighlight, updatePendingHighlights } =
    useHighlightManagement({
      contentRef,
      highlights,
      onHighlight,
    });

  // Load auto-highlight setting from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("autoHighlightEnabled");
    if (stored !== null) {
      setAutoHighlightEnabled(stored === "true");
    }
  }, []);

  // Save auto-highlight setting to localStorage
  const handleToggleAutoHighlight = (enabled: boolean) => {
    setAutoHighlightEnabled(enabled);
    localStorage.setItem("autoHighlightEnabled", enabled.toString());
  };

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

  // Update pending highlight elements with real IDs when highlights are created
  useEffect(() => {
    updatePendingHighlights();
  }, [highlights, updatePendingHighlights]);

  // Render highlights using highlight renderer (for existing highlights)
  useEffect(() => {
    if (!contentRef.current || highlights.length === 0) {
      return;
    }

    const applyHighlights = () => {
      const root = contentRef.current;
      if (!root) return;

      const contentElement = root.querySelector("div") || root;

      applyHighlightsToDOM(
        contentElement as HTMLElement,
        highlights,
        (highlight) => {
          setSelectedHighlight(highlight);
        },
      );
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(applyHighlights);
    });
  }, [highlights, article.content]);

  const handleTextSelection = useCallback(async () => {
    if (!autoHighlightEnabled) {
      return;
    }

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

    const contentElement =
      contentRef.current.querySelector("div") || contentRef.current;

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
  }, [autoHighlightEnabled]);

  const handleHighlightCreate = useCallback(
    async (data: { color: HighlightColor; note?: string; tags?: string[] }) => {
      if (!selectedText) return;

      const success = await createHighlight(selectedText, data);

      if (success) {
        setSelectedText(null);
        window.getSelection()?.removeAllRanges();
      }
    },
    [selectedText, createHighlight],
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

  const getNotesForHighlight = (highlightId: string) => {
    return notes.filter((note) => note.highlightId === highlightId);
  };

  const handleHighlightClick = (highlightId: string | null) => {
    if (highlightId) {
      const highlight = highlights.find((h) => h.id === highlightId);
      if (highlight) {
        setSelectedHighlight(highlight);
      }
    } else {
      setSelectedHighlight(null);
    }
  };

  return (
    <div className="flex h-full flex-col bg-gray-900">
      <ArticleReaderHeader
        article={article}
        onBackClick={onBackClick}
        showSettings={showSettings}
        onToggleSettings={() => setShowSettings(!showSettings)}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        autoHighlightEnabled={autoHighlightEnabled}
        onToggleAutoHighlight={handleToggleAutoHighlight}
      />

      <div className="flex-1 overflow-y-auto">
        <article className="max-w-none px-4 py-6">
          <ArticleMetadata article={article} />
          {/* <StandaloneNotes notes={notes} /> */}
          <ArticleContent
            content={article.content}
            fontSize={fontSize}
            contentRef={contentRef}
            onTextSelection={handleTextSelection}
            onHighlightClick={handleHighlightClick}
            highlights={highlights}
          />
        </article>
      </div>

      {selectedText && (
        <HighlightPopover
          selectedText={selectedText.text}
          position={popoverPosition}
          onHighlight={handleHighlightCreate}
          onCancel={handleCancelSelection}
        />
      )}

      {/* {selectedHighlight && (
      This is to edit the highlight
        <HighlightDialog
          highlight={selectedHighlight}
          notes={getNotesForHighlight(selectedHighlight.id)}
          onClose={() => setSelectedHighlight(null)}
          onUpdateHighlight={onUpdateHighlight}
          onDeleteHighlight={onDeleteHighlight}
          onAddNote={onAddNote}
        />
      )} */}

      <HighlightStyles />
    </div>
  );
}
