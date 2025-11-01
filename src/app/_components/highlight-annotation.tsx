/**
 * Highlight Annotation Component
 * Component for displaying and managing highlights and notes
 */

"use client";

import {
  type Highlight,
  type Note,
  type HighlightColor,
} from "~/types/annotation";
import { useState } from "react";

interface HighlightAnnotationProps {
  highlight: Highlight;
  notes?: Note[];
  onUpdateHighlight?: (
    id: string,
    data: { color?: HighlightColor; note?: string | null; tags?: string[] },
  ) => void;
  onDeleteHighlight?: (id: string) => void;
  onAddNote?: (highlightId: string, content: string) => void;
  onUpdateNote?: (id: string, content: string) => void;
  onDeleteNote?: (id: string) => void;
  readonly?: boolean;
}

const HIGHLIGHT_COLORS: {
  value: HighlightColor;
  name: string;
  bgClass: string;
}[] = [
  { value: "yellow", name: "Yellow", bgClass: "bg-yellow-200" },
  { value: "green", name: "Green", bgClass: "bg-green-200" },
  { value: "blue", name: "Blue", bgClass: "bg-blue-200" },
  { value: "pink", name: "Pink", bgClass: "bg-pink-200" },
  { value: "purple", name: "Purple", bgClass: "bg-purple-200" },
  { value: "orange", name: "Orange", bgClass: "bg-orange-200" },
  { value: "red", name: "Red", bgClass: "bg-red-200" },
  { value: "gray", name: "Gray", bgClass: "bg-gray-200" },
];

export function HighlightAnnotation({
  highlight,
  notes = [],
  onUpdateHighlight,
  onDeleteHighlight,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  readonly = false,
}: HighlightAnnotationProps) {
  const [showActions, setShowActions] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [newNoteContent, setNewNoteContent] = useState("");
  const [showAddNote, setShowAddNote] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [tagsInput, setTagsInput] = useState("");

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getCurrentColorClass = () => {
    const colorConfig = HIGHLIGHT_COLORS.find(
      (c) => c.value === highlight.color,
    );
    return colorConfig?.bgClass || "bg-yellow-200";
  };

  const handleColorChange = (color: HighlightColor) => {
    if (!readonly && onUpdateHighlight) {
      onUpdateHighlight(highlight.id, { color });
    }
    setShowColorPicker(false);
  };

  const handleAddNote = () => {
    if (!newNoteContent.trim() || !onAddNote) return;

    onAddNote(highlight.id, newNoteContent.trim());
    setNewNoteContent("");
    setShowAddNote(false);
  };

  const handleUpdateNote = (noteId: string) => {
    if (!editingContent.trim() || !onUpdateNote) return;

    onUpdateNote(noteId, editingContent.trim());
    setEditingNote(null);
    setEditingContent("");
  };

  const startEditingNote = (note: Note) => {
    setEditingNote(note.id);
    setEditingContent(note.content);
  };

  const cancelEditingNote = () => {
    setEditingNote(null);
    setEditingContent("");
  };

  const handleSaveTags = () => {
    if (!onUpdateHighlight) return;
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .slice(0, 10);
    onUpdateHighlight(highlight.id, { tags });
    setEditingTags(false);
    setTagsInput("");
  };

  const handleCancelTags = () => {
    setEditingTags(false);
    setTagsInput("");
  };

  const handleStartEditingTags = () => {
    setTagsInput(highlight.tags?.join(", ") ?? "");
    setEditingTags(true);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      {/* Highlighted text */}
      <div className="relative">
        <div
          className={`${getCurrentColorClass()} rounded px-2 py-1 text-sm leading-relaxed`}
          onMouseEnter={() => !readonly && setShowActions(true)}
          onMouseLeave={() => !readonly && setShowActions(false)}
        >
          "{highlight.text}"{/* Action buttons */}
          {!readonly && showActions && (
            <div className="absolute top-0 right-0 z-10 flex items-center space-x-1 rounded border border-gray-300 bg-white p-1 shadow-sm">
              {/* Color picker toggle */}
              <button
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="rounded p-1 text-gray-600 hover:text-gray-900"
                title="Change color"
              >
                <svg
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM7 3v18M15 3h4a2 2 0 012 2v12a4 4 0 01-4 4h-4"
                  />
                </svg>
              </button>

              {/* Delete highlight */}
              <button
                onClick={() => {
                  if (confirm("Delete this highlight?")) {
                    onDeleteHighlight?.(highlight.id);
                  }
                }}
                className="rounded p-1 text-gray-600 hover:text-red-600"
                title="Delete highlight"
              >
                <svg
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Color picker */}
        {showColorPicker && (
          <div className="absolute top-full right-0 z-20 mt-1 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
            <div className="grid grid-cols-4 gap-1">
              {HIGHLIGHT_COLORS.map((color) => (
                <button
                  key={color.value}
                  onClick={() => handleColorChange(color.value)}
                  className={`h-6 w-6 rounded ${color.bgClass} border-2 transition-colors ${
                    highlight.color === color.value
                      ? "border-gray-900"
                      : "border-gray-300 hover:border-gray-400"
                  }`}
                  title={color.name}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Highlight note */}
      {highlight.note && (
        <div className="mt-2 rounded bg-gray-50 p-2 text-sm">
          <p className="text-gray-700">{highlight.note}</p>
        </div>
      )}

      {/* Tags */}
      {highlight.tags && highlight.tags.length > 0 && !editingTags && (
        <div className="mt-2 flex flex-wrap gap-1">
          {highlight.tags.map((tag, idx) => (
            <span
              key={idx}
              className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
            >
              {tag}
            </span>
          ))}
          {!readonly && (
            <button
              onClick={handleStartEditingTags}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Edit
            </button>
          )}
        </div>
      )}

      {/* Edit tags */}
      {editingTags && (
        <div className="mt-2">
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="Tags (comma-separated)"
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500 focus:outline-none"
            maxLength={500}
            autoFocus
          />
          <div className="mt-1 flex justify-end space-x-1">
            <button
              onClick={handleCancelTags}
              className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveTags}
              className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Add tags button */}
      {!highlight.tags && !editingTags && !readonly && (
        <div className="mt-2">
          <button
            onClick={handleStartEditingTags}
            className="flex items-center text-xs text-blue-600 hover:text-blue-800"
          >
            <svg
              className="mr-1 h-3 w-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
              />
            </svg>
            Add Tags
          </button>
        </div>
      )}

      {/* Creation date */}
      <div className="mt-2 text-xs text-gray-500">
        Highlighted {formatDate(highlight.createdAt)}
      </div>

      {/* Notes */}
      {notes.length > 0 && (
        <div className="mt-3 space-y-2">
          <h4 className="text-sm font-medium text-gray-700">Notes</h4>
          {notes.map((note) => (
            <div
              key={note.id}
              className="rounded-r border-l-4 border-blue-400 bg-blue-50 p-2"
            >
              {editingNote === note.id ? (
                <div>
                  <textarea
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    className="w-full resize-none rounded border border-gray-300 px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    rows={3}
                    autoFocus
                  />
                  <div className="mt-1 flex justify-end space-x-1">
                    <button
                      onClick={cancelEditingNote}
                      className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleUpdateNote(note.id)}
                      className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-800">{note.content}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      {formatDate(note.createdAt)}
                    </span>
                    {!readonly && (
                      <div className="flex space-x-1">
                        <button
                          onClick={() => startEditingNote(note)}
                          className="text-xs text-gray-600 hover:text-gray-800"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("Delete this note?")) {
                              onDeleteNote?.(note.id);
                            }
                          }}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add note */}
      {!readonly && onAddNote && (
        <div className="mt-3">
          {showAddNote ? (
            <div>
              <textarea
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                placeholder="Add a note to this highlight..."
                className="w-full resize-none rounded border border-gray-300 px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500 focus:outline-none"
                rows={3}
                autoFocus
              />
              <div className="mt-1 flex justify-end space-x-1">
                <button
                  onClick={() => {
                    setShowAddNote(false);
                    setNewNoteContent("");
                  }}
                  className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddNote}
                  disabled={!newNoteContent.trim()}
                  className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add Note
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddNote(true)}
              className="flex items-center text-sm text-blue-600 hover:text-blue-800"
            >
              <svg
                className="mr-1 h-3 w-3"
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
              Add Note
            </button>
          )}
        </div>
      )}
    </div>
  );
}
