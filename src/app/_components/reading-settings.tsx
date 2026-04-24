/**
 * Reading Settings Component
 * Settings panel for font size and highlight preferences
 */

"use client";

import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";
import { Button } from "~/components/ui/button";
import { Minus, Plus } from "lucide-react";

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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Font Size</span>
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onFontSizeChange(Math.max(12, fontSize - 2))}
            className="h-7 w-7 rounded-full text-foreground-soft hover:bg-background-deep hover:text-foreground"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-8 text-center text-sm text-foreground-soft">
            {fontSize}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onFontSizeChange(Math.min(24, fontSize + 2))}
            className="h-7 w-7 rounded-full text-foreground-soft hover:bg-background-deep hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label
          htmlFor="auto-highlight"
          className="text-sm font-medium text-foreground"
        >
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
