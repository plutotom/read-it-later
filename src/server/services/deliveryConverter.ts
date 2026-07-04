import { hashContent } from "~/server/services/paraTextConverter";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function sanitizeDeliveryFilename(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  const core = slug.slice(0, 80) || "article";
  return `${core}.html`;
}

export function buildKindleHtmlDocument(opts: {
  title: string;
  author?: string | null;
  url: string;
  contentHtml: string;
}): { html: string; bytes: number; contentHash: string } {
  const title = escapeHtml(opts.title.trim() || "Untitled");
  const author = opts.author?.trim();
  const url = escapeHtml(opts.url);

  const metaParts: string[] = [];
  if (author) metaParts.push(escapeHtml(author));
  metaParts.push(`<a href="${url}">Original article</a>`);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body {
      font-family: Georgia, "Times New Roman", serif;
      line-height: 1.6;
      max-width: 40em;
      margin: 2em auto;
      padding: 0 1em;
      color: #1a1a1a;
    }
    h1 { font-size: 1.5em; line-height: 1.25; margin-bottom: 0.25em; }
    .meta { color: #666; font-size: 0.9em; margin-bottom: 2em; }
    img { max-width: 100%; height: auto; }
    pre, code { font-family: ui-monospace, monospace; font-size: 0.9em; }
    blockquote { border-left: 3px solid #ccc; margin-left: 0; padding-left: 1em; color: #444; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="meta">${metaParts.join(" · ")}</p>
  ${opts.contentHtml}
</body>
</html>`;

  const bytes = Buffer.byteLength(html, "utf8");

  return {
    html,
    bytes,
    contentHash: hashContent(opts.contentHtml),
  };
}
