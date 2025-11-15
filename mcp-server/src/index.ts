#!/usr/bin/env node

/**
 * MCP Server for Read-It-Later
 * Allows external systems to save articles to the read-it-later app
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { saveArticleTool, handleSaveArticle } from "./tools/save-article.js";

async function main() {
  // Create MCP server
  const server = new Server(
    {
      name: "read-it-later-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [saveArticleTool],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "save_article_to_read_it_later") {
      const result = await handleSaveArticle(args);

      if (result.success) {
        return {
          content: [
            {
              type: "text",
              text: `Article saved successfully! Article ID: ${result.articleId}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `Failed to save article: ${result.error}`,
            },
          ],
          isError: true,
        };
      }
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Read-It-Later MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in MCP server:", error);
  process.exit(1);
});
