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
export function ThemeSwitcher({ className }: { className?: string }) {
  const [theme, setTheme] = useState<ThemeName>(DEFAULT_THEME);

  useLayoutEffect(() => {
    setTheme(readStoredTheme());
  }, []);

  const select = (next: ThemeName) => {
    setTheme(next);
    persistTheme(next);
  };

  return (
    <div className={cn("px-2 py-2", className)}>
      <div className="mb-2 flex items-center gap-2 px-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
        <Palette className="h-3.5 w-3.5" />
        <span>Theme</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {THEMES.map((t) => {
          const active = t.id === theme;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => select(t.id)}
              className={cn(
                "group relative flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-all",
                "border-rule hover:border-foreground/20 hover:bg-background-deep",
                active && "border-rule bg-background-deep",
              )}
              aria-pressed={active}
              aria-label={`Switch to ${t.name} theme`}
            >
              <span
                className="flex h-6 w-6 shrink-0 overflow-hidden rounded-sm ring-1 ring-black/20"
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
                <span className="block truncate text-xs font-medium text-foreground">
                  {t.name}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {t.tagline}
                </span>
              </span>
              {active && (
                <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
