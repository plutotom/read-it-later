"use client";

import { useEffect, useState } from "react";

type ParaEnabledSnapshot = {
  paraEnabled: boolean;
  isLoading: boolean;
};

const DEFAULT_SNAPSHOT: ParaEnabledSnapshot = {
  paraEnabled: true,
  isLoading: true,
};

let snapshot: ParaEnabledSnapshot = DEFAULT_SNAPSHOT;
let loaded = false;
let generation = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

/** Write-through so Preferences saves update nav/chrome without a refetch. */
export function setParaEnabled(paraEnabled: boolean) {
  generation += 1;
  loaded = true;
  inflight = null;
  snapshot = { paraEnabled, isLoading: false };
  emit();
}

export function resetParaEnabledCache() {
  generation += 1;
  loaded = false;
  inflight = null;
  snapshot = DEFAULT_SNAPSHOT;
  emit();
}

function applyFetched(paraEnabled: boolean, gen: number) {
  if (gen !== generation) return;
  loaded = true;
  snapshot = { paraEnabled, isLoading: false };
  emit();
}

function loadParaEnabled(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (inflight) return inflight;

  const gen = generation;
  inflight = (async () => {
    try {
      const response = await fetch("/api/preferences");
      if (!response.ok) {
        applyFetched(true, gen);
        return;
      }
      const data = (await response.json()) as { paraEnabled?: boolean };
      applyFetched(data.paraEnabled !== false, gen);
    } catch {
      applyFetched(true, gen);
    } finally {
      if (gen === generation) {
        inflight = null;
      }
    }
  })();

  return inflight;
}

export function useParaEnabled(): ParaEnabledSnapshot {
  const [state, setState] = useState<ParaEnabledSnapshot>(snapshot);

  useEffect(() => {
    const listener = () => setState(snapshot);
    listeners.add(listener);
    setState(snapshot);
    void loadParaEnabled();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return state;
}
