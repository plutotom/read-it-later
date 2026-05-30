"use client";

import { useEffect, useInsertionEffect, useLayoutEffect } from "react";

import {
  THEME_STORAGE_KEY,
  applyTheme,
  readStoredTheme,
  resolveTheme,
  syncThemeCookie,
} from "~/lib/theme";

function reconcileThemeFromStorage() {
  const theme = readStoredTheme();
  applyTheme(theme);
  return theme;
}

/**
 * Re-apply theme after React hydrates `<html>` (without overwriting storage).
 * useInsertionEffect runs as early as possible on the client.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useInsertionEffect(() => {
    reconcileThemeFromStorage();
  }, []);

  useLayoutEffect(() => {
    const theme = reconcileThemeFromStorage();
    // Heal SSR cookie if user had a palette saved only in localStorage.
    syncThemeCookie(theme);
  }, []);

  // Catch late layout passes (e.g. view transitions) that reset <html>.
  useEffect(() => {
    reconcileThemeFromStorage();

    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY || !event.newValue) return;
      applyTheme(resolveTheme(event.newValue));
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return children;
}
