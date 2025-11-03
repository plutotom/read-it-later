/**
 * Standalone Notes Component
 * Displays notes that are not attached to highlights
 */

"use client";

import { type Note } from "~/types/annotation";
import { type Highlight } from "~/types/annotation";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Link2 } from "lucide-react";
import { getHighlightColorHex } from "./article-reader-utils";

interface StandaloneNotesProps {
  notes: Note[];
  highlights?: Highlight[];
  onAttachToHighlight?: (noteId: string, highlightId: string) => void;
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function StandaloneNotes({
  notes,
  highlights = [],
  onAttachToHighlight,
}: StandaloneNotesProps) {
  const standaloneNotes = notes.filter((n) => !n.highlightId);

  if (standaloneNotes.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 border-t border-gray-700 pt-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-100">Notes</h3>
      <div className="space-y-3">
        {standaloneNotes.map((note) => (
          <div
            key={note.id}
            className="group flex items-start gap-2 rounded-r border-l-4 border-yellow-600 bg-yellow-900/30 p-3"
          >
            <div className="flex-1">
              <p className="text-sm text-gray-200">{note.content}</p>
              <p className="mt-1 text-xs text-gray-400">
                {formatDate(note.createdAt)}
              </p>
            </div>
            {onAttachToHighlight && highlights.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 flex-shrink-0 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-gray-200 hover:bg-gray-800"
                    aria-label="Attach to highlight"
                  >
                    <Link2 className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="max-h-[300px] w-[250px] overflow-y-auto border-gray-700 bg-gray-800"
                >
                  <DropdownMenuItem
                    disabled
                    className="text-xs text-gray-500"
                  >
                    Attach to highlight:
                  </DropdownMenuItem>
                  {highlights.map((highlight) => (
                    <DropdownMenuItem
                      key={highlight.id}
                      onClick={() => onAttachToHighlight(note.id, highlight.id)}
                      className="flex items-center gap-2 text-sm"
                    >
                      <div
                        className="h-3 w-3 flex-shrink-0 rounded"
                        style={{
                          backgroundColor: getHighlightColorHex(highlight.color),
                        }}
                      />
                      <span className="truncate text-gray-200">
                        {highlight.text.length > 40
                          ? `${highlight.text.slice(0, 40)}...`
                          : highlight.text}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
