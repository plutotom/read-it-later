/**
 * Highlight Popover Component
 * Shows when text is selected, allowing user to create a highlight with color, note, and tags
 */

"use client";

import { type HighlightColor } from "~/types/annotation";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Label } from "~/components/ui/label";

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

interface HighlightPopoverProps {
  selectedText: string;
  position: { x: number; y: number };
  onHighlight: (data: {
    color: HighlightColor;
    note?: string;
    tags?: string[];
  }) => void;
  onCancel: () => void;
}

export function HighlightPopover({
  selectedText,
  position,
  onHighlight,
  onCancel,
}: HighlightPopoverProps) {
  const [selectedColor, setSelectedColor] = useState<HighlightColor>("yellow");
  const [note, setNote] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [showTags, setShowTags] = useState(false);

  const handleCreate = () => {
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .slice(0, 10); // Limit to 10 tags

    onHighlight({
      color: selectedColor,
      note: note.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
    });
  };

  return (
    <div
      className="fixed z-50 w-80 rounded-lg border border-gray-200 bg-white p-4 shadow-lg"
      style={{
        left: `${Math.min(position.x, window.innerWidth - 340)}px`,
        top: `${Math.max(10, position.y - 200)}px`,
      }}
    >
      <div className="mb-3">
        <div className="mb-2 text-sm font-medium text-gray-700">Highlight</div>
        <div className="mb-2 max-h-20 overflow-y-auto rounded bg-gray-50 p-2 text-sm text-gray-600 italic">
          "{selectedText.substring(0, 100)}
          {selectedText.length > 100 ? "..." : ""}"
        </div>

        {/* Color picker */}
        <div className="mb-3">
          <Label className="mb-1 text-xs text-gray-600">Color</Label>
          <div className="flex flex-wrap gap-2">
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color.value}
                onClick={() => setSelectedColor(color.value)}
                className={`h-8 w-8 rounded ${color.bgClass} border-2 transition-colors ${
                  selectedColor === color.value
                    ? "border-gray-900 ring-2 ring-gray-400"
                    : "border-gray-300 hover:border-gray-400"
                }`}
                title={color.name}
                aria-label={color.name}
              />
            ))}
          </div>
        </div>

        {/* Note toggle */}
        {/* {!showNote ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowNote(true)}
            className="mb-2 w-full"
          >
            Add Note
          </Button>
        ) : (
          <div className="mb-2">
            <Label className="mb-1 text-xs text-gray-600">Note</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note to this highlight..."
              rows={3}
              className="text-sm"
              maxLength={2000}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowNote(false);
                setNote("");
              }}
              className="mt-1 text-xs"
            >
              Remove note
            </Button>
          </div>
        )} */}

        {/* Tags toggle */}
        {/* {!showTags ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowTags(true)}
            className="mb-2 w-full"
          >
            Add Tags
          </Button>
        ) : (
          <div className="mb-2">
            <Label className="mb-1 text-xs text-gray-600">
              Tags (comma-separated)
            </Label>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g., important, reference, quote"
              className="text-sm"
              maxLength={500}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowTags(false);
                setTagsInput("");
              }}
              className="mt-1 text-xs"
            >
              Remove tags
            </Button>
          </div>
        )} */}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleCreate}
          className="flex-1"
          style={{
            backgroundColor: HIGHLIGHT_COLORS.find(
              (c) => c.value === selectedColor,
            )?.bgClass.replace("bg-", ""),
          }}
        >
          Highlight
        </Button>
      </div>
    </div>
  );
}
