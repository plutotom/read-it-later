"use client";

import { useEffect, useState, type RefObject } from "react";
import { z } from "zod";
import { ListeningController } from "~/lib/listening/controller";
import { createListeningDocument } from "~/lib/listening/document";
import { catalogSchema, type ListeningCatalog } from "~/lib/listening/protocol";
import { HttpSpeechSource } from "~/lib/listening/source";
import { BrowserSpeechTransport } from "~/lib/listening/transport";

const bookmarkSchema = z.object({
  revision: z.string(),
  voiceId: z.string(),
  segment: z.number().int().nonnegative(),
  time: z.number().finite().nonnegative(),
  rate: z.number().finite().min(0.5).max(2),
});

export function useReaderListening(
  articleId: string,
  content: string,
  contentRef: RefObject<HTMLDivElement | null>,
  enabled = true,
) {
  const [catalog, setCatalog] = useState<ListeningCatalog | null>(null);
  const [controller, setController] = useState<ListeningController | null>(
    null,
  );
  useEffect(() => {
    if (
      !enabled ||
      !window.isSecureContext ||
      typeof AudioContext === "undefined" ||
      typeof AudioWorkletNode === "undefined"
    )
      return;
    const abort = new AbortController();
    void fetch("/api/listening/catalog", {
      signal: abort.signal,
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) return;
        return catalogSchema.parse(await response.json());
      })
      .then((value) => {
        if (value && !abort.signal.aborted) setCatalog(value);
      })
      .catch(() => {
        /* The existing recording player remains available. */
      });
    return () => abort.abort();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !catalog?.enabled || !contentRef.current) return;
    const document = createListeningDocument(contentRef.current);
    if (!document.segments.length) return;
    const key = "ril-listening:" + articleId;
    let bookmark: z.infer<typeof bookmarkSchema> | undefined;
    try {
      bookmark = bookmarkSchema.parse(
        JSON.parse(localStorage.getItem(key) ?? "null"),
      );
    } catch {
      /* No usable bookmark. */
    }
    const voice =
      catalog.voices.find((v) => v.id === bookmark?.voiceId) ??
      catalog.voices.find((v) => v.id === catalog.defaultVoice) ??
      catalog.voices[0];
    if (!voice) return;
    const player = new ListeningController(
      articleId,
      document,
      voice,
      new HttpSpeechSource(),
      new BrowserSpeechTransport(),
    );
    if (bookmark) player.restore(bookmark);
    player.onBookmark = (value) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* Storage can be disabled. */
      }
    };
    const save = () => player.pause();
    window.addEventListener("pagehide", save);
    setController(player);
    return () => {
      window.removeEventListener("pagehide", save);
      player.dispose();
      setController(null);
    };
  }, [articleId, content, contentRef, catalog, enabled]);
  return { controller, voices: catalog?.voices ?? [] };
}
