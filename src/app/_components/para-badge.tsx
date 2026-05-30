"use client";

import { Tablet } from "lucide-react";
import { cn } from "~/lib/utils";

interface ParaBadgeProps {
  className?: string;
  size?: "sm" | "md";
}

export function ParaBadge({ className, size = "sm" }: ParaBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 font-medium text-emerald-400",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
        className,
      )}
      title="On Para e-reader sync list"
    >
      <Tablet className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
      Para
    </span>
  );
}
