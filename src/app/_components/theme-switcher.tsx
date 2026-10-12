"use client";

import { useLayoutEffect, useState } from "react";
import { Check, Palette } from "lucide-react";

import {
  DEFAULT_THEME,
  THEMES,
  type ThemeName,
  persistTheme,
  readStoredTheme,
} from "~/lib/theme";
import { cn } from "~/lib/utils";

export type { ThemeName } from "~/lib/theme";
export { THEMES, applyTheme } from "~/lib/theme";

/**
 * Theme switcher rendered as a compact palette grid. Drops cleanly into the
 * user menu dropdown. Persists to localStorage + cookie and applies instantly.
 */
export function ThemeSwitcher({
  className,
  variant = "menu",
}: {
  className?: string;
  /** `panel` uses larger tap targets for the mobile sidebar */
  variant?: "menu" | "panel";
}) {
  const [theme, setTheme] = useState<ThemeName>(DEFAULT_THEME);
  const isPanel = variant === "panel";

  useLayoutEffect(() => {
    setTheme(readStoredTheme());
  }, []);

  const select = (next: ThemeName) => {
    setTheme(next);
    persistTheme(next);
  };

  return (
    <div className={cn(isPanel ? "px-1 py-1" : "px-2 py-2", className)}>
      <div className="text-muted-foreground mb-2 flex items-center gap-2 px-1 text-xs font-medium tracking-wider uppercase">
        <Palette className="h-3.5 w-3.5" />
        <span>Theme</span>
      </div>
      <div className={cn("grid grid-cols-2", isPanel ? "gap-2" : "gap-1.5")}>
        {THEMES.map((t) => {
          const active = t.id === theme;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => select(t.id)}
              className={cn(
                "group relative flex items-center text-left transition-all",
                "border-rule hover:border-foreground/20 hover:bg-background-deep",
                active && "border-rule bg-background-deep",
                isPanel
                  ? "min-h-12 gap-2.5 rounded-lg border px-2.5 py-2"
                  : "gap-2 rounded-md border px-2 py-1.5",
              )}
              aria-pressed={active}
              aria-label={`Switch to ${t.name} theme`}
            >
              <span
                className={cn(
                  "flex shrink-0 overflow-hidden rounded-sm ring-1 ring-black/20",
                  isPanel ? "h-7 w-7" : "h-6 w-6",
                )}
                aria-hidden
              >
                <span
                  className="h-full w-1/3"
                  style={{ background: t.swatches[0] }}
                />
                <span
                  className="h-full w-1/3"
                  style={{ background: t.swatches[1] }}
                />
                <span
                  className="h-full w-1/3"
                  style={{ background: t.swatches[2] }}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-foreground block truncate text-xs font-medium">
                  {t.name}
                </span>
                <span className="text-muted-foreground block truncate text-[10px]">
                  {t.tagline}
                </span>
              </span>
              {active && <Check className="text-accent h-3.5 w-3.5 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
