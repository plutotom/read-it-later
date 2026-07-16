/**
 * Reading Settings Component
 * Settings panel for font size preferences
 */

"use client";

import { Button } from "~/components/ui/button";
import { Minus, Plus } from "lucide-react";

interface ReadingSettingsProps {
  fontSize: number;
  onFontSizeChange: (size: number) => void;
}

export function ReadingSettings({
  fontSize,
  onFontSizeChange,
}: ReadingSettingsProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-foreground text-sm font-medium">Font Size</span>
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onFontSizeChange(Math.max(12, fontSize - 2))}
            className="text-foreground-soft hover:bg-background-deep hover:text-foreground h-7 w-7 rounded-full"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="text-foreground-soft w-8 text-center text-sm">
            {fontSize}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onFontSizeChange(Math.min(24, fontSize + 2))}
            className="text-foreground-soft hover:bg-background-deep hover:text-foreground h-7 w-7 rounded-full"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
