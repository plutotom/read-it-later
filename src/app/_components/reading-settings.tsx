/**
 * Reading Settings Component
 * Settings panel for font size and highlight preferences
 */

"use client";

import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";

interface ReadingSettingsProps {
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  autoHighlight: boolean;
  onAutoHighlightChange: (enabled: boolean) => void;
}

export function ReadingSettings({
  fontSize,
  onFontSizeChange,
  autoHighlight,
  onAutoHighlightChange,
}: ReadingSettingsProps) {
  return (
    <div className="mt-3 space-y-3 rounded-lg bg-gray-800 p-3">
      {/* Font Size */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-200">Font Size</span>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onFontSizeChange(Math.max(12, fontSize - 2))}
            className="p-1 text-gray-400 hover:text-gray-200"
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
          <span className="w-8 text-center text-sm text-gray-300">
            {fontSize}
          </span>
          <button
            onClick={() => onFontSizeChange(Math.min(24, fontSize + 2))}
            className="p-1 text-gray-400 hover:text-gray-200"
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

      {/* Auto Highlight */}
      <div className="flex items-center justify-between">
        <Label htmlFor="auto-highlight" className="text-sm font-medium text-gray-200">
          Auto Highlight
        </Label>
        <Switch
          id="auto-highlight"
          checked={autoHighlight}
          onCheckedChange={onAutoHighlightChange}
        />
      </div>
    </div>
  );
}
