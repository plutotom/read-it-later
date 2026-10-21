import { createHash, randomUUID } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { JSDOM } from "jsdom";
import { and, eq } from "drizzle-orm";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { articles, userPreferences } from "~/server/db/schema";
import { env } from "~/env";
import { createListeningDocument } from "~/lib/listening/document";
import {
  encodeEvent,
  streamRequestSchema,
  MAX_AUDIO_BYTES,
  SAMPLE_RATE,
  type ListeningEvent,
  type ListeningVoice,
} from "~/lib/listening/protocol";
import { SpeechFault, pcm } from "../native-speech/protocol";
import { headers, problem, readBody } from "../native-speech/http";
import type { ArtifactStore } from "../native-speech/cache";
import {
  defaultListeningVoice,
  listeningVoices,
  resolveProvider,
  type ListeningProvider,
} from "./providers";
import { reserveListeningUsageInTransaction } from "./quota";
import { prepareSpeech, googleModel } from "../audio-usage/metering";
import {
  beginAttempt,
  checkpointUsage,
  claimJob,
  finishAttempt,
  finishJob,
  recordReplay,
  renewJob,
} from "../audio-usage/ledger";

export async function listeningSession(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user.id)
    throw new SpeechFault("unauthorized", "Sign in to listen.", 401);
  return session.user.id;
}

export async function listeningCatalog(request: Request) {
  try {
    const userId = await listeningSession(request);
    const enabled = env.WEB_SPEECH_ENABLED === "true";
    const voices = enabled ? listeningVoices() : [];
    const preference = enabled
      ? await db.query.userPreferences.findFirst({
          where: eq(userPreferences.userId, userId),
          columns: { ttsVoiceName: true },
        })
      : undefined;
    return Response.json(
      {
        enabled,
        voices,
        defaultVoice: defaultListeningVoice(voices, preference?.ttsVoiceName),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return problem(error);
  }
}

/** The non-hex prefix keeps these artifacts outside the prototype's cache API. */
export function legacyListeningArtifactId(
  userId: string,
  text: string,
  voice: ListeningVoice,
) {
  return (
    "w" +
    createHash("sha256")
      .update(
        JSON.stringify([
          "web-listening-pcm24-v1",
          userId,
          text,
          voice.id,
          voice.model,
        ]),
      )
      .digest("hex")
      .slice(1)
  );
}

/** Scoped identities keep new environment/provider-account caches independent; old paid audio is a read fallback. */
export function listeningArtifactId(
  userId: string,
  text: string,
  voice: ListeningVoice,
) {
  const prepared = prepareSpeech(
    text,
    voice.provider,
    voice.provider === "google" ? googleModel(voice.id) : voice.model,
    voice.id,
  );
  return (
    "w" +
    createHash("sha256")
      .update(
        JSON.stringify([
          "web-listening-pcm24-v2",
          process.env.VERCEL_ENV ??
            (env.NODE_ENV === "production" ? "production" : "development"),
          env.AUDIO_USAGE_PROVIDER_ACCOUNT ?? "default",
          userId,
          voice.model,
          prepared.payloadHash,
        ]),
      )
      .digest("hex")
      .slice(1)
  );
}

export async function generateListeningArtifact(options: {
  id: string;
  fence: string;
  text: string;
  voice: ListeningVoice;
  requestId: string;
  provider: ListeningProvider;
  store: ArtifactStore;
  emit: (event: ListeningEvent) => void;
  accounting?: { userId: string; jobFence: string; admittedAt: Date };
}) {
  const { id, fence, text, voice, requestId, provider, store, emit } = options;
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 100_000);
  const renewal = setInterval(() => {
    void store
      .renew(id, fence)
      .then(async (owned) => {
        if (!owned) abort.abort();
        if (
          options.accounting &&
          !(await renewJob(id, options.accounting.jobFence))
        )
          abort.abort();
      })
      .catch(() => abort.abort());
  }, 30_000);
  const started = performance.now();
  let frames = "",
    bytes = 0,
    complete = false,
    lastMarkEnd = 0;
  const send = (event: ListeningEvent) => {
    frames += encodeEvent(event);
    emit(event);
  };
  let attempt: string | undefined;
  try {
    const prepared = prepareSpeech(
      text,
      voice.provider,
      voice.provider === "google" ? googleModel(voice.id) : voice.model,
      voice.id,
    );
    if (options.accounting)
      attempt = await beginAttempt(
        id,
        options.accounting.userId,
        options.accounting.jobFence,
        prepared,
        db,
        { units: text.length, raw: text.length },
      );
    send({
      type: "start",
      requestId,
      cached: false,
      sampleRate: SAMPLE_RATE,
      voiceId: voice.id,
    });
    for await (const event of provider.stream(
      text,
      voice,
      abort.signal,
      prepared,
    )) {
      abort.signal.throwIfAborted();
      if (event.type === "usage") {
        if (attempt)
          await checkpointUsage(attempt, event.units).catch(() =>
            console.error("audio_accounting", {
              requestId,
              event: "checkpoint_failed",
            }),
          );
        continue;
      }
      if (complete)
        throw new SpeechFault(
          "invalid_stream",
          "Speech arrived after the segment completed.",
        );
      if (event.type === "audio") {
        const length = pcm(event.data).length;
        if (!bytes && length)
          console.info("web_listening", {
            requestId,
            provider: voice.provider,
            event: "first_audio",
            milliseconds: Math.round(performance.now() - started),
          });
        bytes += length;
        if (bytes > MAX_AUDIO_BYTES)
          throw new SpeechFault(
            "audio_too_large",
            "The speech segment exceeded its audio limit.",
          );
      } else if (event.type === "marks") {
        for (const mark of event.marks) {
          if (
            mark.offset < 0 ||
            mark.offset + mark.length > text.length ||
            mark.start < lastMarkEnd ||
            mark.end <= mark.start
          )
            throw new SpeechFault(
              "invalid_marks",
              "Speech timing data could not be validated.",
            );
          lastMarkEnd = mark.end;
        }
      } else {
        const duration = bytes / (SAMPLE_RATE * 2);
        if (
          !bytes ||
          bytes % 2 ||
          Math.abs(duration - event.duration) > 0.001 ||
          lastMarkEnd > duration + 0.05
        )
          throw new SpeechFault(
            "incomplete_audio",
            "Speech ended before a complete segment was received.",
          );
        complete = true;
      }
      send(event);
    }
    if (!complete)
      throw new SpeechFault(
        "incomplete_audio",
        "Speech ended before a complete segment was received.",
      );
    if (attempt)
      await finishAttempt(
        attempt,
        true,
        bytes,
        bytes / (SAMPLE_RATE * 2),
      ).catch(() =>
        console.error("audio_accounting", {
          requestId,
          event: "settlement_failed",
        }),
      );
    // Retry persistence with the same fenced path and the same paid bytes, never synthesis.
    let stored = false;
    for (let retry = 0; retry < 3; retry++) {
      try {
        stored = await store.save(id, fence, frames);
        break;
      } catch (error) {
        if (retry === 2) throw error;
      }
    }
    if (options.accounting)
      await finishJob(
        id,
        options.accounting.jobFence,
        "complete",
        stored ? "stored" : "failed",
      ).catch(() =>
        console.error("audio_accounting", {
          requestId,
          event: "job_settlement_failed",
        }),
      );
    emit({ type: "archive", state: stored ? "stored" : "failed" });
    console.info("web_listening", {
      requestId,
      provider: voice.provider,
      event: "complete",
      stored,
      characters: text.length,
      milliseconds: Math.round(performance.now() - started),
    });
  } catch (error) {
    if (attempt)
      await finishAttempt(
        attempt,
        complete,
        bytes,
        complete ? bytes / (SAMPLE_RATE * 2) : undefined,
      ).catch(() => undefined);
    if (options.accounting)
      await finishJob(
        id,
        options.accounting.jobFence,
        attempt ? (complete ? "complete" : "unknown") : "not_dispatched",
        "failed",
      ).catch(() => undefined);
    if (complete) emit({ type: "archive", state: "failed" });
    await store.fail(id, fence).catch(() => undefined);
    const code =
      error instanceof SpeechFault
        ? error.code
        : abort.signal.aborted
          ? "timeout"
          : "generation_failed";
    console.error("web_listening", {
      requestId,
      provider: voice.provider,
      event: complete ? "cache_failed" : "failed",
      code,
    });
    if (!complete)
      emit({
        type: "error",
        code,
        message:
          error instanceof SpeechFault
            ? error.message
            : "Speech generation failed. Retry this paragraph.",
      });
  } finally {
    clearTimeout(timeout);
    clearInterval(renewal);
  }
}

export async function listeningStream(request: Request) {
  try {
    const userId = await listeningSession(request);
    if (env.WEB_SPEECH_ENABLED !== "true")
      throw new SpeechFault(
        "not_found",
        "Streaming listening is unavailable.",
        404,
      );
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      throw new SpeechFault(
        "invalid_origin",
        "Open this article in the app to listen.",
        403,
      );
    const input = streamRequestSchema.parse(await readBody(request));
    const voice = listeningVoices().find((v) => v.id === input.voiceId);
    if (!voice)
      throw new SpeechFault(
        "voice_unavailable",
        "This voice is unavailable. Choose another voice.",
        409,
      );
    const article = await db.query.articles.findFirst({
      where: and(eq(articles.id, input.articleId), eq(articles.userId, userId)),
      columns: { content: true },
    });
    if (!article) throw new SpeechFault("not_found", "Article not found.", 404);
    const dom = new JSDOM(article.content);
    let text: string;
    try {
      const document = createListeningDocument(dom.window.document.body);
      if (document.revision !== input.revision)
        throw new SpeechFault(
          "content_changed",
          "This article changed. Refresh it before listening.",
          409,
        );
      const segment = document.segments[input.segment];
      if (!segment)
        throw new SpeechFault(
          "invalid_segment",
          "This passage is unavailable.",
          400,
        );
      text = segment.text;
    } finally {
      dom.window.close();
    }
    if (!env.NATIVE_SPEECH_BLOB_TOKEN && !env.NATIVE_SPEECH_BLOB_STORE_ID)
      throw new SpeechFault(
        "storage_not_configured",
        "Private speech storage must be configured before streaming can start.",
        503,
      );
    const { artifacts, cleanupOrphans } =
      await import("../native-speech/cache");
    const id = listeningArtifactId(userId, text, voice);
    const cached =
      (await artifacts.read(id)) ??
      (await artifacts.read(legacyListeningArtifactId(userId, text, voice)));
    const requestId = randomUUID();
    if (cached) {
      await recordReplay(id, requestId, db, {
        id: userId,
        articleId: input.articleId,
      });
      const frames = cached
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const event = JSON.parse(line) as ListeningEvent;
          return encodeEvent(
            event.type === "start"
              ? { ...event, cached: true, requestId }
              : event,
          );
        })
        .join("");
      return new Response(
        frames + encodeEvent({ type: "archive", state: "stored" }),
        { headers },
      );
    }
    const fence = randomUUID();
    if (!(await artifacts.acquire(id, fence)))
      return Response.json(
        { code: "pending", message: "This passage is already being prepared." },
        {
          status: 202,
          headers: { "Retry-After": "1", "Cache-Control": "no-store" },
        },
      );
    let jobFence: string | null;
    const admittedAt = new Date();
    const provider = resolveProvider(voice);
    try {
      jobFence = await claimJob(
        {
          id,
          userId,
          articleId: input.articleId,
          path: "stream",
          allowanceUnits: text.length,
          admittedAt,
          regenerate: input.regenerate,
        },
        (tx) =>
          reserveListeningUsageInTransaction(
            tx,
            userId,
            text.length,
            admittedAt,
          ),
      );
      if (!jobFence) {
        await artifacts.fail(id, fence);
        return Response.json(
          {
            code: "pending",
            message: "This passage is already being prepared.",
          },
          {
            status: 202,
            headers: { "Retry-After": "1", "Cache-Control": "no-store" },
          },
        );
      }
    } catch (error) {
      await artifacts.fail(id, fence).catch(() => undefined);
      throw error;
    }
    let detached = false;
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          // A subscriber leaving must not discard already-paid audio or admit a duplicate.
          const work = generateListeningArtifact({
            id,
            fence,
            text,
            voice,
            requestId,
            provider,
            store: artifacts,
            accounting: { userId, jobFence, admittedAt },
            emit(event) {
              if (!detached) {
                try {
                  controller.enqueue(encoder.encode(encodeEvent(event)));
                } catch {
                  detached = true;
                }
              }
            },
          }).finally(() => {
            if (!detached) {
              try {
                controller.close();
              } catch {
                /* subscriber left */
              }
            }
          });
          waitUntil(work);
          waitUntil(cleanupOrphans().catch(() => undefined));
        },
        cancel() {
          detached = true;
        },
      }),
      { headers },
    );
  } catch (error) {
    return problem(error);
  }
}
