import { speechAccess } from "~/server/services/native-speech/access";
import { nativeSpeechUnavailable } from "~/server/services/native-speech/availability";
import { headers, problem } from "~/server/services/native-speech/http";
import { SpeechFault, frame } from "~/server/services/native-speech/protocol";
export const runtime = "nodejs";
const valid = (id: string) => {
  if (!/^[a-f0-9]{64}$/.test(id))
    throw new SpeechFault(
      "invalid_id",
      "Invalid speech cache identifier.",
      400,
    );
};
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const unavailable = nativeSpeechUnavailable();
  if (unavailable) return unavailable;
  try {
    const { id } = await context.params;
    valid(id);
    await speechAccess.authorize(request, "read", id);
    const { artifacts, cachedFrames } =
      await import("~/server/services/native-speech/cache");
    if (new URL(request.url).searchParams.has("status")) {
      const row = await artifacts.status(id);
      return Response.json(
        { id, state: row?.state ?? "missing" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const raw = await artifacts.read(id);
    if (!raw) return Response.json({ code: "cache_missing" }, { status: 404 });
    return new Response(
      cachedFrames(raw) + frame({ type: "archive", state: "stored", id }),
      { headers },
    );
  } catch (error) {
    return problem(error);
  }
}
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const unavailable = nativeSpeechUnavailable();
  if (unavailable) return unavailable;
  try {
    const { id } = await context.params;
    valid(id);
    await speechAccess.authorize(request, "delete", id);
    const { removeArtifact } =
      await import("~/server/services/native-speech/cache");
    await removeArtifact(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return problem(error);
  }
}
