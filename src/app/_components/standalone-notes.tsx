/**
 * Standalone Notes Component
 * Displays notes that are not attached to highlights
 */

"use client";

import { type Note } from "~/types/annotation";

interface StandaloneNotesProps {
  notes: Note[];
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function StandaloneNotes({ notes }: StandaloneNotesProps) {
  const standaloneNotes = notes.filter((n) => !n.highlightId);

  if (standaloneNotes.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 border-t border-gray-700 pt-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-100">Notes HERE!</h3>
      <div className="space-y-3">
        {standaloneNotes.map((note) => (
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
  );
}
