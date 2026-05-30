import { NextResponse } from "next/server";
import { db } from "~/server/db";
import {
  authenticateParaRequest,
  getRequestBaseUrl,
} from "~/server/lib/paraAuth";
import { buildManifestForUser } from "~/server/services/paraExportService";

export async function GET(request: Request) {
  const auth = await authenticateParaRequest(
    request.headers.get("authorization"),
  );

  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = getRequestBaseUrl(request);
  const manifest = await buildManifestForUser(db, auth.userId, baseUrl);

  return NextResponse.json(manifest, {
    headers: {
      "Cache-Control": "no-store",
      Connection: "close",
    },
  });
}
