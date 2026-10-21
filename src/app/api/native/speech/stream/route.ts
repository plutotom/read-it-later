import { speechAccess } from "~/server/services/native-speech/access";
import { randomUUID } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { nativeSpeechUnavailable } from "~/server/services/native-speech/availability";
import {
  configured,
  headers,
  problem,
  readBody,
} from "~/server/services/native-speech/http";
import {
  frame,
  identity,
  requestSchema,
} from "~/server/services/native-speech/protocol";
export const runtime = "nodejs";
export const maxDuration = 300;
// Deliberately unrestricted during private prototyping. Replace policy/namespace before public launch.
export async function POST(request: Request) {
  const unavailable = nativeSpeechUnavailable();
  if (unavailable) return unavailable;
  try {
    const { namespace } = await speechAccess.authorize(request, "generate");
    const input = requestSchema.parse(await readBody(request));
    const { artifacts, cachedFrames } =
      await import("~/server/services/native-speech/cache");
    const { generateArtifact } =
      await import("~/server/services/native-speech/generation");
    const id = identity(input, namespace);
    const fence = randomUUID();
    const cached = await artifacts.read(id);
    if (cached)
      return new Response(
        cachedFrames(cached) + frame({ type: "archive", state: "stored", id }),
        { headers },
      );
    const adapter = configured(input.descriptor);
    if (!(await artifacts.acquire(id, fence)))
      return Response.json(
        { id, state: "pending" },
        {
          status: 202,
          headers: { "Retry-After": "1", "Cache-Control": "no-store" },
        },
      );
    let detached = false;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const work = generateArtifact(
          input,
          id,
          fence,
          adapter,
          artifacts,
          (event) => {
            if (!detached) {
              try {
                controller.enqueue(encoder.encode(frame(event)));
              } catch {
                detached = true;
              }
            }
          },
        ).finally(() => {
          if (!detached) {
            try {
              controller.close();
            } catch {
              /* subscriber departed */
            }
          }
        });
        waitUntil(work);
      },
      cancel() {
        detached = true;
      },
    });
    return new Response(body, { headers });
  } catch (error) {
    return problem(error);
  }
}
