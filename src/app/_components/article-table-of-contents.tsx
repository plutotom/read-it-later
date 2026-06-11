/**
 * Floating desktop table of contents — pinned to the left edge of the viewport.
 */

"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "~/lib/utils";
import { type TocHeading } from "~/hooks/use-article-toc";

interface ArticleTableOfContentsProps {
  headings: TocHeading[];
  activeId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (id: string) => void;
}

export function ArticleTableOfContents({
  headings,
  activeId,
  isOpen,
  onClose,
  onNavigate,
}: ArticleTableOfContentsProps) {
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  return (
    <aside
      className={cn(
        "article-toc pointer-events-none fixed z-20 hidden w-[min(240px,28vw)] lg:block",
        "top-[calc(env(safe-area-inset-top,0px)+4.25rem)] bottom-28",
        "left-5 sm:left-8",
        "transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none",
        isOpen
          ? "translate-x-0 opacity-100"
          : "-translate-x-3 opacity-0",
      )}
      aria-label="Table of contents"
      aria-hidden={!isOpen}
    >
      <div
        className={cn(
          "flex h-full flex-col",
          isOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        inert={!isOpen}
      >
        <div className="mb-7 flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="article-toc__close -ml-1 rounded-full p-1.5 text-muted-foreground transition-colors duration-150 hover:text-foreground"
            aria-label="Close table of contents"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <p
          className="mb-8 text-[15px] font-medium tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-app-display)" }}
        >
          Contents
        </p>

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          <ul className="space-y-5">
            {headings.map((heading) => {
              const isActive = activeId === heading.id;

              return (
                <li
                  key={heading.id}
                  className={cn(heading.level === 3 && "pl-3")}
                >
                  <button
                    type="button"
                    onClick={() => onNavigate(heading.id)}
                    className={cn(
                      "article-toc__link block w-full text-left text-[14px] leading-snug transition-[color,opacity] duration-150",
                      "hover:text-foreground",
                      isActive
                        ? "font-medium text-foreground"
                        : "text-muted-foreground/80",
                    )}
                    style={{ fontFamily: "var(--font-app-display)" }}
                    aria-current={isActive ? "location" : undefined}
                  >
                    {heading.text}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
