# Read-It-Later MCP Server

An MCP ([Model Context Protocol](https://modelcontextprotocol.io)) server that
exposes your read-it-later library to AI assistants (Claude Desktop, Cursor,
Claude Code, etc.). The assistant can save, search, read, tag, and share
articles on your behalf.

It talks to the app's **public REST API** (`/api/v1`) using an **API key** — no
session or database access required.

## Architecture

This package is intentionally thin. All the API logic, types, and the
LLM-facing tool prompts live in the shared workspace package
[`@read-it-later/core`](../packages/ril-core); the same package backs (or will
back) the Raycast extension, so prompts and the client stay in one place.

```
mcp-server/src/
  index.ts   # McpServer + stdio transport, reads config from env
  tools.ts   # thin handlers: parse args → call @read-it-later/core client → shape result
```

## Setup

This is part of the root **pnpm workspace**. From the repo root:

```bash
pnpm install                      # installs all workspace packages
pnpm --filter @read-it-later/core build   # build the shared package first
pnpm --filter read-it-later-mcp-server build
```

(The core package must be built before the MCP server, since the server imports
its compiled output.)

## Configuration

Configured entirely through environment variables:

| Variable       | Required | Default                              | Notes |
| -------------- | -------- | ------------------------------------ | ----- |
| `RIL_API_KEY`  | yes      | —                                    | A read-it-later API key (`ril_...`). Create one in the app's settings. Needs the `ril:write` scope for save/update/share. |
| `RIL_BASE_URL` | no       | `https://ril.plutotom.com/api/v1`    | Full API base **including** `/api/v1`. For local dev: `http://localhost:4114/api/v1`. |

## Using it with an MCP client

Point your client at the built entrypoint and pass the env vars. Example
(Claude Desktop / Cursor `mcpServers` config):

```json
{
  "mcpServers": {
    "read-it-later": {
      "command": "node",
      "args": ["/absolute/path/to/read-it-later/mcp-server/dist/index.js"],
      "env": {
        "RIL_API_KEY": "ril_xxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

For Claude Code: `claude mcp add read-it-later -e RIL_API_KEY=ril_... -- node /absolute/path/to/mcp-server/dist/index.js`

## Tools

| Tool                  | What it does |
| --------------------- | ------------ |
| `add_article`         | Save a new article — pass `url` to import a page, or `title` + `content` (HTML) for a manual/pasted entry. |
| `search_articles`     | List recent articles or search by keyword; filter by tag / read / favorite. |
| `get_article_content` | Fetch the full readable text of one article (truncated for very long pieces). |
| `update_article`      | Set tags or change title / favorite / read / archived status. Setting tags replaces existing tags. |
| `list_tags`           | List existing tags with counts (use before tagging to stay consistent). |
| `create_share_link`   | Create a public read-only share link for an article. |

Tool descriptions and input schemas are defined in
`@read-it-later/core`'s `prompts.ts` — edit them there.

## Development

```bash
pnpm dev      # tsc --watch
pnpm build    # tsc
pnpm inspect  # launch the MCP Inspector against the built server
```

`pnpm inspect` runs `@modelcontextprotocol/inspector node dist/index.js` — set
`RIL_API_KEY` in your shell first so tool calls can authenticate.

## Requirements

- Node.js 18+
- A read-it-later API key

## License

MIT
