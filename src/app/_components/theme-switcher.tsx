"use client";

import { useEffect, useState } from "react";
import { Check, Palette } from "lucide-react";

import { cn } from "~/lib/utils";

export type ThemeName =
  | "ember"
  | "parchment"
  | "forest"
  | "cobalt"
  | "matter"
  | "matter-dark";

const STORAGE_KEY = "ril.theme";

interface ThemeDef {
  id: ThemeName;
  name: string;
  tagline: string;
  /** Small palette preview: [background, primary, accent]. */
  swatches: [string, string, string];
  /** Whether the palette is a light theme (drives `.dark` class removal). */
  light?: boolean;
}

export const THEMES: readonly ThemeDef[] = [
  {
    id: "ember",
    name: "Ember",
    tagline: "Volcanic red on charcoal",
    swatches: ["#2b2b2b", "#e0372c", "#5bb5e6"],
  },
  {
    id: "parchment",
    name: "Parchment",
    tagline: "Warm paper, deep ink",
    swatches: ["#f1e9d6", "#5a3d2a", "#c67b3a"],
    light: true,
  },
  {
    id: "forest",
    name: "Forest",
    tagline: "Moss, sage & brass",
    swatches: ["#1f2a24", "#5fbf7a", "#d4a84b"],
  },
  {
    id: "cobalt",
    name: "Cobalt",
    tagline: "Midnight navy, cyan & gold",
    swatches: ["#121a2d", "#4fb8e0", "#e0b84f"],
  },
  {
    id: "matter",
    name: "Matter Paper",
    tagline: "Warm paper, coral & ink",
    swatches: ["#faf6ee", "#e94b27", "#1c1a17"],
    light: true,
  },
  {
    id: "matter-dark",
    name: "Matter Winter",
    tagline: "Warm night, coral & parchment",
    swatches: ["#16130f", "#f26a47", "#efe6d2"],
  },
] as const;

/**
 * Apply a theme to <html>. Safe to call from the pre-hydration inline script
 * — kept tiny and dependency-free. The inline bootstrap in `layout.tsx`
 * mirrors this logic to avoid FOUC.
 */
export function applyTheme(theme: ThemeName): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  const isLight = THEMES.find((t) => t.id === theme)?.light ?? false;
  root.classList.toggle("dark", !isLight);
}

function readStoredTheme(): ThemeName {
  if (typeof window === "undefined") return "ember";
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v && THEMES.some((t) => t.id === v)) return v as ThemeName;
  return "ember";
}

/**
 * Theme switcher rendered as a compact palette grid. Drops cleanly into the
 * user menu dropdown. Persists selection in localStorage and applies the
 * palette instantly without a re-render cascade.
 */
export function ThemeSwitcher({ className }: { className?: string }) {
  const [theme, setTheme] = useState<ThemeName>("ember");

  useEffect(() => {
    setTheme(readStoredTheme());
  }, []);

  const select = (next: ThemeName) => {
    setTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
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
