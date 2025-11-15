# Read-It-Later MCP Server

An MCP (Model Context Protocol) server that allows external systems (like AI assistants) to save articles to the read-it-later app.

## Overview

This MCP server provides a tool for saving articles to the read-it-later app via its tRPC API. The tool supports saving articles with HTML or plain text content, along with optional metadata like author, publication date, folder organization, and tags.

## Features

- Save articles with HTML or plain text content
- Support for optional metadata (author, publication date, folder, tags)
- Automatic validation of input data
- Error handling with clear error messages
- Configurable base URL for the read-it-later app

## Installation

1. Install dependencies:

```bash
cd mcp-server
npm install
```

2. Build the project:

```bash
npm run build
```

## Configuration

The MCP server uses the following environment variable:

- `READ_IT_LATER_BASE_URL`: Base URL of the read-it-later app (defaults to `http://localhost:3000`)

You can also provide the base URL as a parameter in each tool call.

## Usage

### As an MCP Server

The server communicates via stdio and follows the MCP protocol. To use it with an MCP client:

1. Configure your MCP client to run:
   ```bash
   node mcp-server/dist/index.js
   ```

2. The server will be available to your MCP client with the tool `save_article_to_read_it_later`.

### Tool: `save_article_to_read_it_later`

Saves an article to the read-it-later app.

#### Parameters

- `content` (required): The article content in HTML or plain text format
- `title` (required): The title of the article (1-500 characters)
- `author` (optional): The author of the article (max 200 characters)
- `publishedAt` (optional): Publication date in ISO 8601 format (e.g., `2024-01-01T00:00:00Z`)
- `folderId` (optional): UUID of the folder to organize this article
- `tags` (optional): Array of tags (max 20 tags, each max 50 characters)
- `baseUrl` (optional): Base URL of the read-it-later app (overrides environment variable)

#### Example

```json
{
  "content": "<p>This is the article content...</p>",
  "title": "Example Article",
  "author": "John Doe",
  "publishedAt": "2024-01-01T00:00:00Z",
  "tags": ["technology", "programming"],
  "baseUrl": "http://localhost:3000"
}
```

## Development

### Building

```bash
npm run build
```

### Development Mode (Watch)

```bash
npm run dev
```

### Running

```bash
npm start
```

## API Details

The MCP server communicates with the read-it-later app's tRPC API:

- **Endpoint**: `POST /api/trpc/article.createFromText`
- **Authentication**: None required (uses public procedures)
- **Request Format**: tRPC batch format

## Error Handling

The tool provides clear error messages for:

- Validation errors (missing required fields, invalid formats)
- Network errors (connection issues, timeouts)
- API errors (server errors, invalid responses)

## Testing

### Test JSON Examples

Here are example JSON requests you can use to test the MCP tool:

#### Minimal Example (Required Fields Only)

```json
{
  "content": "<p>This is a simple test article.</p>",
  "title": "Test Article"
}
```

#### Complete Example (All Fields)

```json
{
  "content": "<h1>Complete Test Article</h1><p>This article tests all available fields.</p>",
  "title": "Complete Test Article",
  "author": "John Doe",
  "publishedAt": "2024-01-15T10:30:00Z",
  "folderId": "123e4567-e89b-12d3-a456-426614174000",
  "tags": ["test", "mcp", "article"],
  "baseUrl": "http://localhost:3000"
}
```

#### MCP Protocol Request Format

When calling via MCP protocol (JSON-RPC 2.0):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "save_article_to_read_it_later",
    "arguments": {
      "content": "<p>Article content here</p>",
      "title": "Article Title",
      "author": "Optional Author",
      "publishedAt": "2024-01-15T10:30:00Z",
      "tags": ["tag1", "tag2"]
    }
  }
}
```

See `test-examples.json` and `test-request.json` for more examples.

### Manual Testing

You can test the MCP server manually by:

1. Start your read-it-later app (make sure it's running on the configured base URL)
2. Build the MCP server: `npm run build`
3. Run the server: `npm start`
4. Send JSON-RPC requests via stdin (or use an MCP client)

## Requirements

- Node.js 18 or higher
- The read-it-later app must be running and accessible

## License

MIT

