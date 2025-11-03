/**
 * Highlights Menu Component
 * Dropdown menu showing all highlights for an article with delete functionality
 */

"use client";

import { type Highlight } from "~/types/annotation";
import { useState, useEffect } from "react";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Highlighter, Trash2, Pencil, Check, X } from "lucide-react";
import { getHighlightColorHex } from "./article-reader-utils";

interface HighlightsMenuProps {
  highlights: Highlight[];
  onHighlightDelete?: (highlightId: string) => void;
  onHighlightNoteUpdate?: (highlightId: string, note: string | null) => void;
}

function HighlightItem({
  highlight,
  onDelete,
  onNoteUpdate,
}: {
  highlight: Highlight;
  onDelete?: (highlightId: string) => void;
  onNoteUpdate?: (highlightId: string, note: string | null) => void;
}) {
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(highlight.note ?? "");

  // Sync note value when highlight changes (e.g., after update from server)
  useEffect(() => {
    if (!isEditingNote) {
      setNoteValue(highlight.note ?? "");
    }
  }, [highlight.note, isEditingNote]);

  const handleSaveNote = () => {
    if (onNoteUpdate) {
      onNoteUpdate(highlight.id, noteValue.trim() || null);
    }
    setIsEditingNote(false);
  };

  const handleCancelEdit = () => {
    setNoteValue(highlight.note ?? "");
    setIsEditingNote(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      handleCancelEdit();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSaveNote();
    }
  };

  return (
    <div className="group border-b border-gray-700 p-2 last:border-b-0 hover:bg-gray-700/50">
      <div className="flex items-start gap-2">
        <div
          className="mt-1 h-4 w-4 flex-shrink-0 rounded"
          style={{
            backgroundColor: getHighlightColorHex(highlight.color),
          }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-200 line-clamp-2">
            {highlight.text}
          </p>
          {isEditingNote ? (
            <div className="mt-2 space-y-2">
              <Textarea
                value={noteValue}
                onChange={(e) => setNoteValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a note..."
                className="min-h-[60px] resize-none border-gray-600 bg-gray-900 text-sm text-gray-200 placeholder:text-gray-500 focus:border-gray-500"
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSaveNote}
                  className="h-7 text-xs text-green-400 hover:text-green-300 hover:bg-green-500/10"
                >
                  <Check className="mr-1 h-3 w-3" />
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancelEdit}
                  className="h-7 text-xs text-gray-400 hover:text-gray-300 hover:bg-gray-800"
                >
                  <X className="mr-1 h-3 w-3" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-2">
              {highlight.note ? (
                <p className="text-xs text-gray-400 line-clamp-2">
                  {highlight.note}
                </p>
              ) : (
                <p className="text-xs text-gray-500 italic">No note</p>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {onNoteUpdate && !isEditingNote && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingNote(true);
              }}
              aria-label="Edit note"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {onDelete && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-gray-400 hover:text-red-400 hover:bg-red-500/10"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(highlight.id);
              }}
              aria-label="Delete highlight"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function HighlightsMenu({
  highlights,
  onHighlightDelete,
  onHighlightNoteUpdate,
}: HighlightsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="relative text-gray-400 hover:text-gray-200 hover:bg-gray-800"
          aria-label="Highlights"
        >
          <Highlighter className="h-5 w-5" />
          {highlights.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
              {highlights.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[400px] w-[300px] overflow-y-auto border-gray-700 bg-gray-800"
      >
        {highlights.length === 0 ? (
          <div className="px-2 py-4 text-center text-sm text-gray-400">
            No highlights yet
          </div>
        ) : (
          highlights.map((highlight) => (
            <HighlightItem
              key={highlight.id}
              highlight={highlight}
              onDelete={onHighlightDelete}
              onNoteUpdate={onHighlightNoteUpdate}
            />
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

