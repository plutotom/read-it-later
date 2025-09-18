"use client";

import { create } from "zustand";

export type ThemeMode = "light" | "dark" | "system";

export interface AppState {
  themeMode: ThemeMode;
  isSidebarOpen: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  toggleSidebar: (forceState?: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  themeMode: "system",
  isSidebarOpen: false,
  setThemeMode: (mode) => set({ themeMode: mode }),
  toggleSidebar: (forceState) =>
    set((state) => ({
      isSidebarOpen:
        typeof forceState === "boolean" ? forceState : !state.isSidebarOpen,
    })),
}));
