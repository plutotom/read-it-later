"use client";

import { BookOpen } from "lucide-react";
import { cn } from "~/lib/utils";

interface KindleBadgeProps {
  className?: string;
  size?: "sm" | "md";
  status?: "sent" | "failed" | "pending";
}

export function KindleBadge({
  className,
  size = "sm",
  status = "sent",
}: KindleBadgeProps) {
  const tone =
    status === "failed"
      ? "border-red-500/30 bg-red-500/10 text-red-400"
      : status === "pending"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
        : "border-sky-500/30 bg-sky-500/10 text-sky-400";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        tone,
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
        className,
      )}
      title={
        status === "failed"
          ? "Kindle delivery failed"
          : status === "pending"
            ? "Sending to Kindle"
            : "Sent to Kindle"
      }
    >
      <BookOpen className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
      Kindle
    </span>
  );
}
