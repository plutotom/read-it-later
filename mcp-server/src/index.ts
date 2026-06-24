#!/usr/bin/env node

/**
 * MCP server for Read-It-Later.
 *
 * Exposes the read-it-later public REST API (`/api/v1`) as MCP tools so an AI
 * assistant can save, search, read, tag, and share articles.
 *
 * Configuration (environment variables):
 *   RIL_API_KEY   (required) a read-it-later API key, e.g. `ril_...`
 *   RIL_BASE_URL  (optional) full API base incl. /api/v1. Defaults to the
 *                 hosted instance (https://ril.plutotom.com/api/v1). For local
 *                 dev use http://localhost:4114/api/v1.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@read-it-later/core";
import { registerTools } from "@read-it-later/core/mcp";

async function main() {
  const apiKey = process.env.RIL_API_KEY;
  if (!apiKey) {
    console.error(
      "Missing RIL_API_KEY. Set it to a read-it-later API key (ril_...). Create one in the app's settings.",
    );
    process.exit(1);
  }

  const client = createClient({ apiKey, baseUrl: process.env.RIL_BASE_URL });

  const server = new McpServer({
    name: "read-it-later",
    version: "0.2.0",
  });

  registerTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Read-It-Later MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in MCP server:", error);
  process.exit(1);
});
