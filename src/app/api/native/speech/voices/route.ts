import { catalog } from "~/server/services/native-speech/http";
import { nativeSpeechUnavailable } from "~/server/services/native-speech/availability";
export const runtime = "nodejs";
export function GET() {
  const unavailable = nativeSpeechUnavailable();
  if (unavailable) return unavailable;
  return Response.json(
    { protocol: 1, mode: "unrestricted-prototype", voices: catalog() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
