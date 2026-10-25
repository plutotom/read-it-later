import {
  nativeLibraryRoute,
  readNativeLibraryBody,
} from "~/server/services/native-library/http";
import { mutateNativeLibrary } from "~/server/services/native-library/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return nativeLibraryRoute(request, async (owner) =>
    mutateNativeLibrary(owner, await readNativeLibraryBody(request)),
  );
}
