/**
 * Highlight Dialog Component
 * Modal dialog for viewing and editing highlight details
 */

"use client";

import {
  type Highlight,
  type Note,
  type HighlightColor,
} from "~/types/annotation";
import { HighlightAnnotation } from "./highlight-annotation";

interface HighlightDialogProps {
  highlight: Highlight;
  notes: Note[];
  onClose: () => void;
  onUpdateHighlight?: (
    id: string,
    data: { color?: HighlightColor; note?: string | null; tags?: string[] },
  ) => void;
  onDeleteHighlight?: (id: string) => void;
  onAddNote?: (content: string, highlightId?: string) => void;
}

export function HighlightDialog({
  highlight,
  notes,
  onClose,
  onUpdateHighlight,
  onDeleteHighlight,
  onAddNote,
}: HighlightDialogProps) {
  const handleDelete = (id: string) => {
    onDeleteHighlight?.(id);
    onClose();
  };

  return (
    <div className="bg-opacity-70 fixed inset-0 z-50 flex items-center justify-center bg-black p-4">
      <div className="w-full max-w-2xl rounded-lg border border-gray-700 bg-gray-800 p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-100">
            Highlight Details
          </h3>
          <button
            onClick={onClose}
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
          highlight={highlight}
          notes={notes}
          onUpdateHighlight={onUpdateHighlight}
          onDeleteHighlight={handleDelete}
          onAddNote={onAddNote}
        />
      </div>
    </div>
  );
}
