import { ZodError } from "zod";
import { env } from "~/env";
import { identity, type Descriptor, SpeechFault } from "./protocol";
import { providerAdapter, voices } from "./providers";
export const headers = {
  "Cache-Control": "private, no-store",
  "Content-Type": "application/x-ndjson",
  "X-Content-Type-Options": "nosniff",
};
export function catalog() {
  return [
    env.NATIVE_SPEECH_PROVIDER ?? "speechify",
    env.NATIVE_SPEECH_PROVIDER === "inworld" ? "speechify" : "inworld",
  ].flatMap((p) => {
    const provider = p as Descriptor["provider"];
    return (
      provider === "speechify" ? env.SPEECHIFY_API_KEY : env.INWORLD_API_KEY
    )
      ? voices(provider)
      : [];
  });
}
export function configured(d: Descriptor) {
  if (
    !catalog().some(
      (v) =>
        identity({ text: "", descriptor: v.descriptor }) ===
        identity({ text: "", descriptor: d }),
    )
  )
    throw new SpeechFault(
      "voice_unavailable",
      "This resolved voice configuration is unavailable. Select an available voice.",
      409,
    );
  if (!env.NATIVE_SPEECH_BLOB_TOKEN && !env.NATIVE_SPEECH_BLOB_STORE_ID)
    throw new SpeechFault(
      "storage_not_configured",
      "Private speech storage is not configured.",
      503,
    );
  return providerAdapter(
    d.provider,
    (d.provider === "speechify" ? env.SPEECHIFY_API_KEY : env.INWORLD_API_KEY)!,
  );
}
export async function readBody(request: Request) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new SpeechFault(
      "invalid_content_type",
      "Use application/json for speech requests.",
      415,
    );
  if (!request.body)
    throw new SpeechFault(
      "invalid_request",
      "A speech request is required.",
      400,
    );
  const reader = request.body.getReader();
  let data = "";
  const decoder = new TextDecoder();
  let count = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.length;
      if (count > 32_000)
        throw new SpeechFault(
          "request_too_large",
          "Select a shorter passage.",
          413,
        );
      data += decoder.decode(value, { stream: true });
    }
    return JSON.parse(data + decoder.decode()) as unknown;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
export function problem(error: unknown) {
  const fault =
    error instanceof SpeechFault
      ? error
      : error instanceof ZodError || error instanceof SyntaxError
        ? new SpeechFault("invalid_request", "Invalid speech request.", 400)
        : new SpeechFault(
            "service_unavailable",
            "Speech service is temporarily unavailable. Check its database and storage configuration.",
            503,
          );
  return Response.json(
    { code: fault.code, message: fault.message },
    { status: fault.status, headers: { "Cache-Control": "no-store" } },
  );
}
