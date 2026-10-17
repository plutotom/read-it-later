import { catalog } from "~/server/services/native-speech/http";
export const runtime = "nodejs";
export function GET() {
  return Response.json(
    { protocol: 1, mode: "unrestricted-prototype", voices: catalog() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
