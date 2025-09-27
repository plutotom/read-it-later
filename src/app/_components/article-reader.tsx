/**
 * Article Reader Component
 * Mobile-optimized reading experience for articles
 */

"use client";

import { type Article } from "~/types/article";
import { type Highlight, type Note } from "~/types/annotation";
import { useState, useRef, useEffect } from "react";

interface ArticleReaderProps {
  article: Article;
  highlights?: Highlight[];
  notes?: Note[];
  onHighlight?: (text: string, startOffset: number, endOffset: number) => void;
  onAddNote?: (content: string, highlightId?: string) => void;
  onBackClick?: () => void;
  onMarkAsRead?: () => void;
}

export function ArticleReader({
  article,
  highlights = [],
  notes = [],
  onHighlight,
  onAddNote,
  onBackClick,
  onMarkAsRead,
}: ArticleReaderProps) {
  const [selectedText, setSelectedText] = useState<{
    text: string;
    startOffset: number;
    endOffset: number;
  } | null>(null);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [fontSize, setFontSize] = useState(16);
  const [showSettings, setShowSettings] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Mark as read when component mounts
    if (!article.isRead && onMarkAsRead) {
      onMarkAsRead();
    }
  }, [article.isRead, onMarkAsRead]);

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !contentRef.current) return;

    const range = selection.getRangeAt(0);
    const selectedText = selection.toString().trim();

    if (selectedText.length < 3) return; // Minimum selection length

    // Calculate offsets relative to content
    const contentNode = contentRef.current;
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(contentNode);
    preCaretRange.setEnd(range.startContainer, range.startOffset);
    const startOffset = preCaretRange.toString().length;
    const endOffset = startOffset + selectedText.length;

    setSelectedText({
      text: selectedText,
      startOffset,
      endOffset,
    });
  };

  const handleHighlightCreate = () => {
    if (!selectedText || !onHighlight) return;

    onHighlight(
      selectedText.text,
      selectedText.startOffset,
      selectedText.endOffset,
    );
    setSelectedText(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleAddNote = () => {
    if (!noteContent.trim() || !onAddNote) return;

    onAddNote(noteContent.trim());
    setNoteContent("");
    setShowNoteDialog(false);
  };

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

  // Render content with highlights
  const renderContentWithHighlights = () => {
    if (highlights.length === 0) {
      return <div dangerouslySetInnerHTML={{ __html: article.content }} />;
    }

    // For now, just render the HTML content without highlighting
    // TODO: Implement proper HTML-aware highlighting
    return <div dangerouslySetInnerHTML={{ __html: article.content }} />;
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={onBackClick}
            className="flex items-center text-gray-600 hover:text-gray-900"
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
              className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
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
              className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
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
          <div className="mt-3 rounded-lg bg-gray-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                Font Size
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setFontSize(Math.max(12, fontSize - 2))}
                  className="p-1 text-gray-600 hover:text-gray-900"
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
                <span className="w-8 text-center text-sm text-gray-600">
                  {fontSize}
                </span>
                <button
                  onClick={() => setFontSize(Math.min(24, fontSize + 2))}
                  className="p-1 text-gray-600 hover:text-gray-900"
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
            <div className="mb-2 flex items-center text-sm text-gray-500">
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

            <h1 className="mb-4 text-2xl leading-tight font-bold text-gray-900">
              {article.title}
            </h1>

            {article.author && (
              <p className="mb-4 text-gray-600">By {article.author}</p>
            )}

            {article.tags && article.tags.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {article.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800"
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
          >
            {renderContentWithHighlights()}
          </div>

          {/* Notes section */}
          {notes.length > 0 && (
            <div className="mt-8 border-t border-gray-200 pt-6">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">
                Notes
              </h3>
              <div className="space-y-3">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-r border-l-4 border-yellow-400 bg-yellow-50 p-3"
                  >
                    <p className="text-sm text-gray-800">{note.content}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {formatDate(note.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </article>
      </div>

      {/* Selection actions */}
      {selectedText && (
        <div className="fixed right-4 bottom-4 left-4 z-20 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="mr-3 flex-1 truncate text-sm text-gray-600">
              "{selectedText.text.substring(0, 50)}
              {selectedText.text.length > 50 ? "..." : ""}"
            </span>
            <div className="flex space-x-2">
              <button
                onClick={handleHighlightCreate}
                className="rounded bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-700 hover:bg-yellow-200"
              >
                Highlight
              </button>
              <button
                onClick={() => setShowNoteDialog(true)}
                className="rounded bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-200"
              >
                Note
              </button>
              <button
                onClick={() => setSelectedText(null)}
                className="rounded bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Note dialog */}
      {showNoteDialog && (
        <div className="bg-opacity-50 fixed inset-0 z-50 flex items-end justify-center bg-black p-4 sm:items-center">
          <div className="w-full rounded-t-lg bg-white sm:max-w-md sm:rounded-lg">
            <div className="p-4">
              <h3 className="mb-3 text-lg font-semibold text-gray-900">
                Add Note
              </h3>
              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Write your note..."
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                rows={4}
                autoFocus
              />
              <div className="mt-3 flex justify-end space-x-2">
                <button
                  onClick={() => {
                    setShowNoteDialog(false);
                    setNoteContent("");
                  }}
                  className="rounded bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddNote}
                  disabled={!noteContent.trim()}
                  className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add Note
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
