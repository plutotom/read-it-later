"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useBrowserStorage } from "~/app/_components/browser-storage-provider";
import { STORAGE_EVENT, type StorageChange } from "~/lib/browser-audio-storage";

/** Network playback starts immediately; completed playback is retained for next time. */
export function useCachedAudio(
  url: string | undefined,
  title: string,
  audioRef: RefObject<HTMLAudioElement | null>,
) {
  const storage = useBrowserStorage();
  const [local, setLocal] = useState<{ url: string; objectUrl: string }>();
  const [downloaded, setDownloaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const attempted = useRef<string | undefined>(undefined);
  const objectUrl = useRef<string | undefined>(undefined);
  const downloadVersion = useRef(0);

  useEffect(() => {
    let active = true;
    setDownloaded(false);
    setSaving(false);
    downloadVersion.current++;
    setError(undefined);
    attempted.current = undefined;
    if (url && storage) {
      void storage
        .get(url)
        .then((file) => {
          if (!active || !file) return;
          setDownloaded(file.downloaded);
          // Do not restart a stream that the user has already started.
          if (!audioRef.current?.paused) return;
          const next = URL.createObjectURL(file.blob);
          objectUrl.current = next;
          setLocal({ url, objectUrl: next });
        })
        .catch(() => {
          /* Browser storage is optional; streaming stays available. */
        });
    }
    return () => {
      active = false;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = undefined;
    };
  }, [url, storage, audioRef]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !url || !storage) return;
    const retain = () => {
      if (attempted.current === url || local?.url === url) return;
      attempted.current = url;
      // Reuse the browser HTTP cache after the original stream has finished.
      void storage.save(url, title).catch(() => undefined);
    };
    const buffered = () => {
      if (
        audio.duration > 0 &&
        Number.isFinite(audio.duration) &&
        audio.buffered.length > 0 &&
        audio.buffered.start(0) === 0 &&
        audio.buffered.end(audio.buffered.length - 1) >= audio.duration - 0.1
      )
        retain();
    };
    audio.addEventListener("ended", retain);
    audio.addEventListener("progress", buffered);
    return () => {
      audio.removeEventListener("ended", retain);
      audio.removeEventListener("progress", buffered);
    };
  }, [url, title, storage, audioRef, local?.url]);

  useEffect(() => {
    let active = true;
    const changed = (event: Event) => {
      const change = (event as CustomEvent<StorageChange>).detail;
      if (change?.owner !== storage?.owner) return;
      if (change.kind !== "update") {
        audioRef.current?.pause();
        attempted.current = url;
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = undefined;
        setLocal(undefined);
      }
      if (url && storage)
        void storage
          .get(url)
          .then((file) => {
            if (active) setDownloaded(!!file?.downloaded);
          })
          .catch(() => undefined);
    };
    window.addEventListener(STORAGE_EVENT, changed);
    return () => {
      active = false;
      window.removeEventListener(STORAGE_EVENT, changed);
    };
  }, [url, storage, audioRef]);

  const download = useCallback(async () => {
    if (!url || !storage || saving) return;
    const version = downloadVersion.current;
    setSaving(true);
    setError(undefined);
    try {
      const saved = await storage.save(url, title, true);
      if (version !== downloadVersion.current) return;
      if (!saved)
        throw new Error("This audio could not be kept on this browser.");
      setDownloaded(true);
    } catch (cause) {
      if (version !== downloadVersion.current) return;
      setError(
        cause instanceof DOMException && cause.name === "QuotaExceededError"
          ? "Your browser is out of storage. Remove some downloads and try again."
          : cause instanceof Error
            ? cause.message
            : "Could not save audio on this browser.",
      );
    } finally {
      if (version === downloadVersion.current) setSaving(false);
    }
  }, [url, title, storage, saving]);

  return {
    src: local && local.url === url ? local.objectUrl : url,
    downloaded,
    saving,
    error,
    download: storage ? download : undefined,
  };
}
