import { auth } from "~/server/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { passwordLoginLimit } from "~/server/services/native-auth/rate-limit";

const handlers = toNextJsHandler(auth);
export const GET = handlers.GET;
export async function POST(request: Request) {
  const limited = await passwordLoginLimit(request);
  if (limited) {
    void request.body?.cancel().catch(() => undefined);
    return limited;
  }
  return handlers.POST(request);
}
