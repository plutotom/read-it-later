"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import {
  BrowserAudioStorage,
  STORAGE_CHANNEL,
  STORAGE_EVENT,
  type StorageChange,
} from "~/lib/browser-audio-storage";

const StorageContext = createContext<BrowserAudioStorage | null>(null);
export const useBrowserStorage = () => useContext(StorageContext);

export function BrowserStorageProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const storage = useMemo(() => new BrowserAudioStorage(userId), [userId]);
  useEffect(() => {
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(STORAGE_CHANNEL)
        : undefined;
    if (channel)
      channel.onmessage = (event: MessageEvent<StorageChange>) => {
        if (event.data?.owner !== userId) return;
        if (event.data.kind === "sign-out") storage.dispose();
        window.dispatchEvent(
          new CustomEvent(STORAGE_EVENT, { detail: event.data }),
        );
      };
    return () => {
      channel?.close();
    };
  }, [storage, userId]);
  return (
    <StorageContext.Provider value={storage}>
      {children}
    </StorageContext.Provider>
  );
}
