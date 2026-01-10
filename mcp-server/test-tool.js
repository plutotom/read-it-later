#!/usr/bin/env node

/**
 * Test script to verify the save_article_to_read_it_later tool works
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serverPath = join(__dirname, "dist", "index.js");

console.log("Testing MCP tool: save_article_to_read_it_later\n");

const proc = spawn("node", [serverPath], {
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    READ_IT_LATER_BASE_URL: "http://localhost:3000",
  },
});

let output = "";
let errorOutput = "";

proc.stdout.on("data", (data) => {
  output += data.toString();
});

proc.stderr.on("data", (data) => {
  errorOutput += data.toString();
  // stderr is used for logging in MCP servers
  if (data.toString().includes("Read-It-Later MCP server")) {
    console.log("✓ Server started");
  }
});

proc.on("close", (code) => {
  if (output) {
    try {
      const response = JSON.parse(output.trim());
      console.log("\nResponse:", JSON.stringify(response, null, 2));

      if (response.result) {
        console.log("\n✓ Tool executed successfully!");
      } else if (response.error) {
        console.log("\n✗ Tool error:", response.error);
      }
    } catch (e) {
      console.log("\nRaw output:", output);
    }
  }
  process.exit(code || 0);
});

// Wait a bit for server to initialize
setTimeout(() => {
  // First, list tools
  const listToolsRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  };

  console.log("1. Listing tools...");
  proc.stdin.write(JSON.stringify(listToolsRequest) + "\n");

  // Then call the tool
  setTimeout(() => {
    const callToolRequest = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "save_article_to_read_it_later",
        arguments: {
          content: "<p>This is a test article from the MCP server.</p>",
          title: "MCP Server Test Article",
          author: "Test User",
          tags: ["test", "mcp"],
        },
      },
    };

    console.log("2. Calling save_article_to_read_it_later tool...");
    proc.stdin.write(JSON.stringify(callToolRequest) + "\n");

    // Close stdin and wait for response
    setTimeout(() => {
      proc.stdin.end();
    }, 1000);
  }, 500);
}, 500);

// Kill after 10 seconds if still running
setTimeout(() => {
  proc.kill();
  console.log("\n⚠ Test timeout");
  process.exit(1);
}, 10000);
