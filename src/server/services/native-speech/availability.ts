import { env } from "~/env";

/** Fail closed, including when env validation is skipped during builds/tests. */
export function nativeSpeechUnavailable(): Response | null {
  if (env.NATIVE_SPEECH_ENABLED === "true") return null;
  return Response.json(
    { code: "not_found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}
