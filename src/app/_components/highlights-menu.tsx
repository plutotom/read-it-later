/**
 * Highlights Menu Component
 * Dropdown menu showing all highlights for an article with delete functionality
 */

"use client";

import { type Highlight } from "~/types/annotation";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Highlighter, Trash2 } from "lucide-react";
import { getHighlightColorHex } from "./article-reader-utils";

interface HighlightsMenuProps {
  highlights: Highlight[];
  onHighlightDelete?: (highlightId: string) => void;
}

export function HighlightsMenu({
  highlights,
  onHighlightDelete,
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
            <div
              key={highlight.id}
              className="group flex items-start gap-2 border-b border-gray-700 p-2 last:border-b-0 hover:bg-gray-700/50"
            >
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
              </div>
              {onHighlightDelete && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 flex-shrink-0 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onHighlightDelete(highlight.id);
                  }}
                  aria-label="Delete highlight"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

