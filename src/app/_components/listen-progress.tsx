/**
 * Listen Progress Component
 * Circular progress indicator showing how much of an article's audio has been listened to
 */

"use client";

import { cn } from "~/lib/utils";
import { Headphones } from "lucide-react";

interface ListenProgressProps {
  /** Progress value between 0 and 1 */
  progress: number;
  /** Size in pixels */
  size?: number;
  /** Optional className */
  className?: string;
}

export function ListenProgress({
  progress,
  size = 24,
  className,
}: ListenProgressProps) {
  // Clamp progress between 0 and 1
  const clampedProgress = Math.max(0, Math.min(1, progress));
  
  // SVG circle calculations
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - clampedProgress);

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      title={`${Math.round(clampedProgress * 100)}% listened`}
    >
      {/* Background circle */}
      <svg
        className="absolute inset-0"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-700"
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="text-blue-400 transition-all duration-300"
          style={{
            transform: "rotate(-90deg)",
            transformOrigin: "50% 50%",
          }}
        />
      </svg>
      
      {/* Center icon */}
      <Headphones className="size-3 text-blue-400" />
    </div>
  );
}
