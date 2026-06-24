/**
 * Hosted MCP endpoint (Streamable HTTP) for read-it-later.
 *
 * Exposes the same tool surface as the standalone stdio server (`mcp-server/`),
 * but over HTTP so MCP clients (Cursor, Claude Desktop, …) can connect to a URL
 * instead of running a local node process. Tool logic is shared via
 * `@read-it-later/core/mcp` — this route only handles transport + auth.
 *
 * Auth: per-request `Authorization: Bearer ril_...` (the same API keys the REST
 * API at `/api/v1` uses). The key is forwarded to the core client, which calls
 * `/api/v1`, so scope checks + validation happen exactly as for REST clients.
 *
 * Because we authenticate per request (not OAuth), the mcp-handler is built
 * fresh per request closing over a client made from that request's key. This is
 * safe: we run stateless Streamable HTTP (no `sessionIdGenerator`), so there is
 * no cross-request session state to preserve.
 *
 * Client config example:
 *   {
 *     "read-it-later": {
 *       "url": "https://ril.plutotom.com/api/mcp",
 *       "headers": { "Authorization": "Bearer ril_..." }
 *     }
 *   }
 */

import { createMcpHandler } from "mcp-handler";
import { createClient, type RilClient } from "@read-it-later/core";
import { registerTools } from "@read-it-later/core/mcp";
import { getRequestBaseUrl } from "~/server/lib/apiAuth";
import { extractBearerToken } from "~/server/lib/apiKey";

// `add_article` can fetch + extract a remote URL, which is slow. Needs Fluid
// Compute on Vercel (Pro) for this to take effect beyond the Hobby 10s cap.
export const maxDuration = 60;

function buildHandler(client: RilClient) {
  return createMcpHandler(
    (server) => {
      registerTools(server, client);
    },
    { serverInfo: { name: "read-it-later", version: "0.2.0" } },
    { basePath: "/api/mcp", maxDuration: 60, disableSse: true },
  );
}

function unauthorized(): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: "unauthorized",
        message:
          "Missing API key. Send 'Authorization: Bearer ril_...' (create a key in the app settings).",
      },
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": 'Bearer realm="read-it-later"',
        "Cache-Control": "no-store",
      },
    },
  );
}

async function handle(request: Request): Promise<Response> {
  const apiKey = extractBearerToken(request.headers.get("authorization"));
  if (!apiKey) return unauthorized();

  const client = createClient({
    apiKey,
    baseUrl: `${getRequestBaseUrl(request)}/api/v1`,
  });

  return buildHandler(client)(request);
}

export { handle as GET, handle as POST, handle as DELETE };
