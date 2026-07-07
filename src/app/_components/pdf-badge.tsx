"use client";

import { FileText } from "lucide-react";
import { cn } from "~/lib/utils";

interface PdfBadgeProps {
  className?: string;
  size?: "sm" | "md";
}

export function PdfBadge({ className, size = "sm" }: PdfBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 font-medium text-amber-400",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
        className,
      )}
      title="PDF document"
    >
      <FileText className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
      PDF
    </span>
  );
}
