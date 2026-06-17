import { NextResponse } from "next/server";
import { getRequestBaseUrl } from "~/server/lib/apiAuth";
import { buildOpenApiSpec } from "~/server/lib/openapiSpec";

// Public: clients fetch this to discover the API. No authentication required.
export function GET(request: Request) {
  const spec = buildOpenApiSpec(getRequestBaseUrl(request));
  return NextResponse.json(spec, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
