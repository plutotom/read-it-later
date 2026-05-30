import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { authenticateParaRequest } from "~/server/lib/paraAuth";
import { getExportForDownload } from "~/server/services/paraExportService";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const auth = await authenticateParaRequest(
    request.headers.get("authorization"),
  );

  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const exportRow = await getExportForDownload(db, auth.userId, id);

  if (!exportRow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(exportRow.txtContent, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Length": String(exportRow.bytes),
      "Cache-Control": "no-store",
      Connection: "close",
    },
  });
}
