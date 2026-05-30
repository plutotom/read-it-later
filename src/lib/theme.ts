/**
 * App color palette themes — single source of truth for SSR, inline bootstrap,
 * and client persistence (localStorage + cookie).
 */

export const THEME_STORAGE_KEY = "ril.theme";
export const THEME_COOKIE_KEY = "ril.theme";
export const DEFAULT_THEME = "ember" as const;

export type ThemeName =
  | "ember"
  | "parchment"
  | "forest"
  | "cobalt"
  | "matter"
  | "matter-dark";

export const THEME_IDS: readonly ThemeName[] = [
  "ember",
  "parchment",
  "forest",
  "cobalt",
  "matter",
  "matter-dark",
] as const;

/** Palettes that use the light `.dark`-off variant (see `applyTheme`). */
export const LIGHT_THEME_IDS: ReadonlySet<ThemeName> = new Set([
  "parchment",
  "matter",
]);

export interface ThemeDef {
  id: ThemeName;
  name: string;
  tagline: string;
  swatches: [string, string, string];
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

const THEME_ID_SET = new Set<string>(THEME_IDS);

export function isThemeName(value: string | null | undefined): value is ThemeName {
  return typeof value === "string" && THEME_ID_SET.has(value);
}

export function resolveTheme(value: string | null | undefined): ThemeName {
  return isThemeName(value) ? value : DEFAULT_THEME;
}

export function isLightTheme(theme: ThemeName): boolean {
  return LIGHT_THEME_IDS.has(theme);
}

/** Apply palette to `<html>`. Safe in inline bootstrap and client code. */
export function applyTheme(theme: ThemeName): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  if (isLightTheme(theme)) {
    root.classList.remove("dark");
  } else {
    root.classList.add("dark");
  }
}

export function readStoredTheme(): ThemeName {
  if (typeof window === "undefined") return DEFAULT_THEME;

  try {
    const fromStorage = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeName(fromStorage)) return fromStorage;
  } catch {
    // Private mode / blocked storage — fall through to cookie.
  }

  return DEFAULT_THEME;
}

export function syncThemeCookie(theme: ThemeName): void {
  void fetch("/api/theme", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme }),
    keepalive: true,
  }).catch(() => {
    // Best-effort; localStorage + DOM still apply.
  });
}

/** Persist theme for reload (localStorage), SSR (cookie via API), and live DOM. */
export function persistTheme(theme: ThemeName): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Continue — cookie + DOM still help.
  }

  applyTheme(theme);
  syncThemeCookie(theme);
}

/**
 * Inline script — must run before React hydrates `<html>`.
 * Prefer localStorage; cookie is synced on the server via /api/theme.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(() => {
  var KEY = ${JSON.stringify(THEME_STORAGE_KEY)};
  var allowed = ${JSON.stringify(THEME_IDS)};
  var light = ${JSON.stringify([...LIGHT_THEME_IDS])};
  var fallback = ${JSON.stringify(DEFAULT_THEME)};
  try {
    var t = localStorage.getItem(KEY);
    if (!t || allowed.indexOf(t) === -1) t = fallback;
    var r = document.documentElement;
    r.setAttribute('data-theme', t);
    if (light.indexOf(t) !== -1) r.classList.remove('dark');
    else r.classList.add('dark');
  } catch (_) {
    var root = document.documentElement;
    root.setAttribute('data-theme', fallback);
    root.classList.add('dark');
  }
})();`;
