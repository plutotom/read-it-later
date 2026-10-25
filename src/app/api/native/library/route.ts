import { env } from "~/env";
import { nativeLibraryRoute } from "~/server/services/native-library/http";
import { NativeLibraryError } from "~/server/services/native-library/errors";
import { pullNativeLibrary } from "~/server/services/native-library/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return nativeLibraryRoute(request, async (owner) => {
    const params = new URL(request.url).searchParams;
    const rawLimit = params.get("limit");
    const rawProtocol = params.get("protocolVersion");
    if (
      params.getAll("protocolVersion").length > 1 ||
      (rawProtocol !== null && rawProtocol !== "1" && rawProtocol !== "2") ||
      params.getAll("cursor").length > 1 ||
      params.getAll("limit").length > 1 ||
      (rawLimit !== null && !/^[1-9]\d{0,2}$/u.test(rawLimit))
    )
      throw new NativeLibraryError("invalid_query", 400);
    return pullNativeLibrary(owner, {
      cursor: params.get("cursor") ?? undefined,
      limit: rawLimit === null ? undefined : Number(rawLimit),
      secret: env.AUTH_SECRET,
      protocolVersion: rawProtocol === "2" ? 2 : 1,
    });
  });
}
