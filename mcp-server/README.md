# Read-It-Later MCP Server

An MCP ([Model Context Protocol](https://modelcontextprotocol.io)) server that
exposes your read-it-later library to AI assistants (Claude Desktop, Cursor,
Claude Code, etc.). The assistant can save, search, read, tag, and share
articles on your behalf.

It talks to the app's **public REST API** (`/api/v1`) using an **API key** — no
session or database access required.

## Architecture

This package is intentionally thin. All the API logic, types, the LLM-facing
tool prompts, **and the tool registration itself** live in the shared workspace
package [`@read-it-later/core`](../packages/ril-core); the same package backs
(or will back) the Raycast extension, so prompts and the client stay in one
place.

```
mcp-server/src/
  index.ts   # McpServer + stdio transport, reads config from env, calls registerTools()

packages/ril-core/src/
  mcp.ts     # registerTools(): thin handlers → @read-it-later/core client → shaped result
             # (exposed via the @read-it-later/core/mcp subpath)
```

Because tool registration lives in `@read-it-later/core/mcp`, the **hosted**
MCP endpoint (`/api/mcp` in the main app) and this **stdio** server share the
exact same tools — see [Hosted vs stdio](#hosted-vs-stdio) below.

## Hosted vs stdio

There are two ways to connect a client, backed by the same tools:

| | **Hosted (recommended)** | **stdio (this package)** |
| --- | --- | --- |
| Where it runs | The deployed app (`/api/mcp`) | A local `node` process on your machine |
| Client config | A URL + `Authorization` header | A `command` + `args` + env |
| Setup for users | Paste a URL + key — no install/build | Clone, `pnpm build`, absolute path |
| Best for | Everyone; phones/hosted clients | Offline use, local dev, power users |

### Hosted (Streamable HTTP)

The app serves the same MCP tools at **`https://ril.plutotom.com/api/mcp`** over
Streamable HTTP. Auth is per-request: send your API key as a Bearer token. No
local install, no build.

Create a key (Preferences → API Keys, **Read & write**), then add to your
client:

```json
{
  "mcpServers": {
    "read-it-later": {
      "url": "https://ril.plutotom.com/api/mcp",
      "headers": { "Authorization": "Bearer ril_xxxxxxxxxxxxxxxxxxxx" }
    }
  }
}
```

For local dev the endpoint is `http://localhost:4114/api/mcp`. The transport is
stateless (no Redis/session store required). The rest of this README covers the
stdio server below.

## Quick start (stdio)

### 1. Build

This is part of the root **pnpm workspace**. From the repo root:

```bash
pnpm install
pnpm --filter @read-it-later/core build   # build the shared package first
pnpm --filter read-it-later-mcp-server build
```

The core package must be built before the MCP server, since the server imports
its compiled output. There is no `dist/` until you run the build step above.

### 2. Create an API key

In the read-it-later app, open **Preferences** (`/preferences`) → **API Keys**.

1. Enter a label (e.g. `Cursor MCP`).
2. Choose **Read & write** — required for `add_article`, `update_article`, and
   `create_share_link`.
3. Click **Create** and copy the full key (`ril_...`). It is only shown once.

### 3. Add to your MCP client

Point the client at the built entrypoint and pass the env vars. Use an
**absolute path** to `dist/index.js` — relative paths often fail because the
client's working directory is not the repo root.

#### Cursor

**Settings → MCP → Add new MCP server**, or add a project config at
`.cursor/mcp.json`:

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

Reload the MCP server in Cursor (or reload the window). You should see the nine
tools listed below.

#### Claude Desktop

Same JSON shape as above — add it under **Settings → Developer → Edit Config**
in the `mcpServers` block.

#### Claude Code

```bash
claude mcp add read-it-later -e RIL_API_KEY=ril_... -- node /absolute/path/to/mcp-server/dist/index.js
```

### 4. Local dev vs production

**Production** (default): omit `RIL_BASE_URL` — the server defaults to
`https://ril.plutotom.com/api/v1`.

**Local dev** (app running on port 4114): add `RIL_BASE_URL` to the env block:

```json
"env": {
  "RIL_API_KEY": "ril_xxxxxxxxxxxxxxxxxxxx",
  "RIL_BASE_URL": "http://localhost:4114/api/v1"
}
```

## Configuration

Configured entirely through environment variables:

| Variable       | Required | Default                              | Notes |
| -------------- | -------- | ------------------------------------ | ----- |
| `RIL_API_KEY`  | yes      | —                                    | A read-it-later API key (`ril_...`). Create one in Preferences → API Keys. Needs the `ril:write` scope for save/update/share. |
| `RIL_BASE_URL` | no       | `https://ril.plutotom.com/api/v1`    | Full API base **including** `/api/v1`. For local dev: `http://localhost:4114/api/v1`. |

Do not commit your API key. Prefer your MCP client's env UI, or keep secrets in
a local-only config file that is not checked into git.

## Tools

| Tool                  | What it does |
| --------------------- | ------------ |
| `add_article`         | Save a new article — pass `url` to import a page, or `title` + `content` (HTML) for a manual/pasted entry. |
| `search_articles`     | List recent articles or search by keyword; filter by tag / read / favorite. |
| `get_article_content` | Fetch the full readable text of one article (truncated for very long pieces). |
| `update_article`      | Set tags or change title / favorite / read / archived status. Setting tags replaces existing tags. |
| `list_tags`           | List existing tags with counts (use before tagging to stay consistent). |
| `create_share_link`   | Create a public read-only share link for an article. |
| `list_para_exports`   | List articles on the Para e-reader sync list. |
| `add_to_para`         | Add an article to the Para sync list by article id. |
| `remove_from_para`    | Remove from the Para sync list by export id or article id. |

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
