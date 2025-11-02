/**
 * Custom Hook for Highlight Management
 * Handles highlight creation, selection, and DOM updates
 */

import { useRef, useCallback, type RefObject } from "react";
import { type Highlight, type HighlightColor } from "~/types/annotation";
import highlight from "~/lib/highlihgter-util";
import { extractContext } from "~/lib/highlight-renderer";
import { getHighlightColorHex } from "./article-reader-utils";

interface SelectedText {
  text: string;
  startOffset: number;
  endOffset: number;
  range: Range;
}

interface UseHighlightManagementProps {
  contentRef: RefObject<HTMLDivElement | null>;
  highlights: Highlight[];
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
}

export function useHighlightManagement({
  contentRef,
  highlights,
  onHighlight,
}: UseHighlightManagementProps) {
  const pendingHighlightsRef = useRef<
    Map<
      number,
      { text: string; startOffset: number; endOffset: number; color: string }
    >
  >(new Map());

  const handleHighlightCreate = useCallback(
    async (
      selectedText: SelectedText,
      data: { color: HighlightColor; note?: string; tags?: string[] },
    ) => {
      if (!onHighlight || !contentRef.current) return false;

      // Restore the selection from the stored range
      const selection = window.getSelection();
      if (!selection) return false;

      // Clear any existing selection and restore from stored range
      selection.removeAllRanges();
      selection.addRange(selectedText.range);

      if (selection.isCollapsed) return false;

      // Find the actual content element (the inner div with the HTML)
      const contentElement =
        contentRef.current.querySelector("div") || contentRef.current;

      // Get the container from the selection range
      const range = selection.getRangeAt(0);
      let container: HTMLElement | null = null;
      let ancestor: Node | null = range.commonAncestorContainer;

      // Sometimes the element will only be text. Get the parent in that case
      while (ancestor) {
        if (ancestor instanceof HTMLElement) {
          container = ancestor;
          break;
        }
        ancestor = ancestor.parentNode;
      }

      // Ensure container is an HTMLElement
      if (!container) {
        container = contentElement as HTMLElement;
      }

      // Make sure container is within our content element
      if (!contentElement.contains(container)) {
        container = contentElement as HTMLElement;
      }

      // Extract context for disambiguation
      const { prefix, suffix } = extractContext(
        contentElement as HTMLElement,
        selectedText.startOffset,
        selectedText.endOffset,
      );

      // Generate a temporary ID for the highlight
      const tempHighlightIndex = Date.now();

      // Track this pending highlight so we can update it with the real ID later
      pendingHighlightsRef.current.set(tempHighlightIndex, {
        text: selectedText.text,
        startOffset: selectedText.startOffset,
        endOffset: selectedText.endOffset,
        color: data.color,
      });

      // Call the highlight function to create the DOM highlight
      const colorHex = getHighlightColorHex(data.color);
      const success = highlight(
        selectedText.text,
        container,
        selection,
        colorHex,
        "inherit",
        tempHighlightIndex,
      );

      if (!success) {
        console.error("Failed to create highlight in DOM");
        pendingHighlightsRef.current.delete(tempHighlightIndex);
        return false;
      }

      // Store the highlight via API
      onHighlight({
        text: selectedText.text,
        startOffset: selectedText.startOffset,
        endOffset: selectedText.endOffset,
        color: data.color,
        note: data.note,
        tags: data.tags,
        contextPrefix: prefix,
        contextSuffix: suffix,
      });

      return true;
    },
    [onHighlight, contentRef],
  );

  const updatePendingHighlights = useCallback(() => {
    if (!contentRef.current || pendingHighlightsRef.current.size === 0) {
      return;
    }

    const root = contentRef.current;
    const contentElement = root.querySelector("div") || root;

    // Update any pending highlight elements with their real IDs
    pendingHighlightsRef.current.forEach((pendingData, tempId) => {
      // Find the matching highlight in the highlights array
      const matchingHighlight = highlights.find(
        (h) =>
          h.text === pendingData.text &&
          h.startOffset === pendingData.startOffset &&
          h.endOffset === pendingData.endOffset &&
          h.color === pendingData.color,
      );

      if (matchingHighlight) {
        // Update the DOM element with the real highlight ID
        const highlightElements = contentElement.querySelectorAll<HTMLElement>(
          `highlighter-span[data-highlight-id="${tempId}"]`,
        );
        highlightElements.forEach((el) => {
          el.dataset.highlightId = matchingHighlight.id;
        });

        // Remove from pending since we found the match
        pendingHighlightsRef.current.delete(tempId);
      }
    });
  }, [highlights, contentRef]);

  return {
    handleHighlightCreate,
    updatePendingHighlights,
  };
}
