"use client";

import { Progress } from "~/components/ui/progress";
import { api } from "~/trpc/react";

/**
 * Format a number with K/M suffixes for display
 */
function formatCharacterCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(0)}K`;
  }
  return count.toString();
}

/**
 * Get progress bar color based on percentage used
 */
function getProgressColor(percentageUsed: number): string {
  if (percentageUsed >= 90) return "bg-red-500";
  if (percentageUsed >= 75) return "bg-orange-500";
  if (percentageUsed >= 50) return "bg-yellow-500";
  return "bg-emerald-500";
}

/**
 * Format reset date for display
 */
function formatResetDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface TTSUsageDisplayProps {
  compact?: boolean; // Use compact display for dropdown
}

export function TTSUsageDisplay({ compact = false }: TTSUsageDisplayProps) {
  const { data: usage, isLoading } = api.tts.getUsage.useQuery();

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="mb-2 h-4 w-24 rounded bg-gray-600" />
        <div className="h-2 w-full rounded bg-gray-600" />
      </div>
    );
  }

  if (!usage) {
    return null;
  }

  const progressColor = getProgressColor(usage.percentageUsed);
  const formattedUsed = formatCharacterCount(usage.charactersUsed);
  const formattedLimit = formatCharacterCount(usage.freeLimit);
  const formattedRemaining = formatCharacterCount(usage.charactersRemaining);

  if (compact) {
    return (
      <div className="px-2 py-2">
        {/* Usage amount display - styled like the screenshot */}
        <div className="mb-1 text-sm font-medium text-gray-200">
          {formattedUsed} / {formattedLimit} included usage
        </div>

        {/* Progress bar */}
        <div className="relative mb-1.5">
          <Progress
            value={usage.percentageUsed}
            className="h-1.5 bg-gray-700"
          />
          <div
            className={`absolute left-0 top-0 h-full rounded-full ${progressColor} transition-all`}
            style={{ width: `${Math.min(100, usage.percentageUsed)}%` }}
          />
        </div>

        {/* Free usage remaining */}
        <div className="mb-1 text-sm text-emerald-400">
          +{formattedRemaining} free usage on us ☁
        </div>

        {/* Reset date */}
        <div className="text-xs text-gray-400">
          Resets {formatResetDate(usage.resetDate)}
        </div>

        {/* Percentage indicator */}
        <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
          <span
            className={`inline-block h-2 w-2 rounded-full ${progressColor}`}
          />
          You&apos;ve used {usage.percentageUsed.toFixed(0)}% of your usage limit
        </div>
      </div>
    );
  }

  // Full display (for settings page or other contexts)
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <h3 className="mb-3 text-lg font-semibold text-white">TTS Usage</h3>

      <div className="mb-2 text-sm text-gray-300">
        {formattedUsed} / {formattedLimit} characters used
      </div>

      <Progress value={usage.percentageUsed} className="mb-3 h-2 bg-gray-700" />

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-gray-400">Voice Type</div>
          <div className="font-medium capitalize text-white">
            {usage.voiceType}
          </div>
        </div>
        <div>
          <div className="text-gray-400">Remaining</div>
          <div className="font-medium text-emerald-400">
            {formattedRemaining}
          </div>
        </div>
        <div>
          <div className="text-gray-400">Resets</div>
          <div className="font-medium text-white">
            {formatResetDate(usage.resetDate)}
          </div>
        </div>
        <div>
          <div className="text-gray-400">Usage</div>
          <div
            className={`font-medium ${usage.percentageUsed >= 90 ? "text-red-400" : "text-white"}`}
          >
            {usage.percentageUsed.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}
