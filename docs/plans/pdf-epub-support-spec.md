# PDF & EPUB Support — Implementation Spec

> Handoff document for implementing in-app PDF/EPUB viewing, file upload, and text extraction.
> Read `CLAUDE.md` for repo-wide conventions before starting.

---

## Summary

Add first-class PDF and EPUB support to the read-it-later app. Users should be able to:

1. Save PDF/EPUB **URLs** (extend existing URL import)
2. **Upload** PDF/EPUB files from their device
3. **View** documents in-app (not just "open original" placeholder)
4. **Extract text** at ingest so search, TTS, and PARA work on documents

The app already has partial PDF scaffolding (`contentKind: "pdf"`, detection, placeholder UI, feature gates). EPUB is greenfield. No schema migration is required for v1 — extend the existing `metadata` jsonb column.

---

## Repo Context

| Item | Value |
|------|-------|
| Stack | Next.js 15 (App Router), tRPC v11, Drizzle ORM (Postgres), BetterAuth, Tailwind v4, shadcn/ui |
| Package manager | `pnpm` |
| Dev server port | `4114` |
| Import alias | `~/` → `src/` |
| Blob storage | `@vercel/blob` (already used for TTS audio in `src/server/services/tts.ts`) |
| Pre-merge checks | `pnpm check` (lint + typecheck), `pnpm test` |

### Key existing files

| Path | Role |
|------|------|
| `src/server/db/schema.ts` | `read-it-later_article` table — `content` (text), `metadata` (jsonb) |
| `src/types/article.ts` | `ArticleContentKind`, `ArticleMetadata` |
| `src/lib/pdf-detection.ts` | PDF magic bytes, content-type, URL heuristics |
| `src/lib/article-content-kind.ts` | `getArticleContentKind()`, `isPdfArticle()`, TTS/PARA gate messages |
| `src/server/services/articleExtractor.ts` | URL fetch + Readability; PDF path returns empty content placeholder |
| `src/server/services/articleService.ts` | Shared CRUD for tRPC + REST |
| `src/server/api/routers/article.ts` | tRPC article router |
| `src/app/_components/article-reader.tsx` | Main reader — branches on `isPdf` |
| `src/app/_components/article-pdf-placeholder.tsx` | "Open original PDF" placeholder (replace with viewer) |
| `src/app/_components/add-article-form.tsx` | URL / text toggle — add file upload tab |
| `src/server/services/tts.ts` | Blocks TTS for PDF articles |
| `src/server/services/paraExportService.ts` | Blocks PARA sync for PDF articles |
| `src/server/services/searchService.ts` | Searches `articles.content` — PDFs are unsearchable today (empty content) |

---

## Goals

- In-app PDF and EPUB viewing inside `ArticleReader`
- URL import for remote PDF/EPUB links
- Direct file upload (PDF, EPUB)
- Server-side text extraction at ingest → populate `content` for search/TTS/PARA
- Consistent UX with existing articles (inbox, folders, return, tags, favorites, sharing)
- Safe handling of user-uploaded binaries

## Non-goals (v1)

- OCR for scanned PDFs
- PDF annotations / form filling
- EPUB or PDF text highlights (phase 2)
- Editing uploaded documents

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ INGEST (Server — Node.js runtime, NOT Edge)                 │
│                                                             │
│  URL save ──┐                                               │
│             ├──► Detect kind (html | pdf | epub)            │
│  Upload ────┘         │                                     │
│                       ├── html → ArticleExtractor (existing)│
│                       └── pdf/epub →                        │
│                             1. Mirror to Vercel Blob (opt)  │
│                             2. documentExtractService       │
│                             3. Store text in content col    │
│                             4. Store binary ref in metadata │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ READ (Client — dynamic import, ssr: false)                  │
│                                                             │
│  ArticleReader branches on metadata.contentKind:            │
│    html  → ArticleContent (existing dangerouslySetInnerHTML)│
│    pdf   → PdfViewer (react-pdf + pdfjs-dist)               │
│    epub  → EpubViewer (foliate-js)                          │
│                                                             │
│  Binary served via GET /api/documents/[articleId]/stream    │
│  (auth-gated; supports Range requests)                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ DOWNSTREAM (existing pipelines, minimal changes)            │
│                                                             │
│  SearchService  → reads articles.content                    │
│  tts.ts         → remove PDF block when content populated   │
│  paraExportService → remove PDF block when content populated│
└─────────────────────────────────────────────────────────────┘
```

**Core principle:** Server extracts text once → stores in `content`. Client renders binary from auth-gated stream URL. Do NOT inject EPUB spine HTML into TipTap or `ArticleContent`.

---

## Data Model

No new tables for v1. Extend types in `src/types/article.ts`.

### Extended `ArticleContentKind`

```typescript
export type ArticleContentKind = "html" | "pdf" | "epub" | "text";
```

### Extended `ArticleMetadata`

```typescript
export type DocumentExtractionStatus =
  | "pending"
  | "processing"
  | "complete"
  | "failed"
  | "skipped"; // scanned PDF with no text layer

export interface ArticleMetadata {
  contentKind?: ArticleContentKind;

  // Document storage
  blobUrl?: string;           // Vercel Blob URL
  blobPath?: string;          // documents/{userId}/{articleId}.pdf
  mimeType?: string;
  byteSize?: number;
  originalFilename?: string;

  // Extraction
  extractionStatus?: DocumentExtractionStatus;
  extractionError?: string;
  extractedAt?: string;       // ISO timestamp

  // PDF-specific
  pageCount?: number;

  // EPUB-specific
  epubIdentifier?: string;
  chapterCount?: number;
  toc?: Array<{ title: string; href: string }>;

  // Reading progress (client-synced via tRPC)
  readingPosition?: {
    type: "pdf" | "epub";
    page?: number;              // PDF: 1-based
    cfi?: string;               // EPUB: Canonical Fragment Identifier
    percent?: number;
  };

  // Existing fields unchanged
  siteName?: string;
  siteUrl?: string;
  description?: string;
  imageUrl?: string;
  language?: string;
  category?: string;
}
```

### Column usage

| `contentKind` | `content` column stores | `url` column stores |
|---------------|------------------------|---------------------|
| `html` | Sanitized HTML (current behavior) | Original URL |
| `pdf` | Extracted plain text | Original URL or `upload://{articleId}` |
| `epub` | Extracted plain text (chapters joined with `\n\n---\n\n`) | Original URL or `upload://{articleId}` |
| `text` | Normalized HTML (current behavior) | `text://manual-...` |

---

## Ingestion Flows

### A. URL import (extend existing)

**Current behavior** (`articleExtractor.ts` → `getPdfExtractionData`):
- Detects PDF via `detectPdfResponse()` in `src/lib/pdf-detection.ts`
- Returns placeholder: empty `content`, `metadata.contentKind: "pdf"`
- Reader shows `ArticlePdfPlaceholder`

**New behavior:**

1. Fetch URL (keep existing SSRF/size limits)
2. Detect kind: `html` | `pdf` | `epub`
3. For `pdf` / `epub`:
   - Set metadata (`contentKind`, `mimeType`, `byteSize`)
   - Optionally mirror bytes to Vercel Blob (recommended on first view or at ingest if origin may block CORS)
   - Run `documentExtractService.extract(buffer, kind)`
   - Populate `content`, `wordCount`, `readingTime`, `pageCount` / `chapterCount`
   - Set `extractionStatus: "complete" | "skipped" | "failed"`
4. Insert via existing `createArticleFromUrl()` in `articleService.ts`

**EPUB detection** — create `src/lib/epub-detection.ts`:

- Magic bytes: ZIP header `PK\x03\x04` + contains `mimetype` file with `application/epub+zip`
- Content-Type: `application/epub+zip`
- URL: `.epub` extension (with HTML false-positive guard, mirroring `pdf-detection.ts`)

### B. File upload (new)

```
Client                              Server
  │                                    │
  ├─ Select .pdf / .epub               │
  ├─ tRPC article.createUploadSession  │
  │   { filename, mimeType, byteSize } │
  │   ← { uploadToken, articleId }     │
  ├─ @vercel/blob/client upload() ────►│
  │                                    ├─ tRPC article.finalizeUpload
  │                                    ├─ Validate magic bytes + size
  │                                    ├─ Create article row
  │                                    ├─ Run documentExtractService
  │                                    └─ Return article
  └─ Navigate to /article/[id]         │
```

**Limits (v1 defaults):**

| Constraint | Value |
|------------|-------|
| Max file size | 50 MB |
| Allowed MIME | `application/pdf`, `application/epub+zip` |
| Extraction timeout | 60s (`maxDuration` on route/mutation) |
| Blob path | `documents/{userId}/{articleId}.{ext}` |

Mirror the existing TTS blob pattern in `src/server/services/tts.ts`:

```typescript
const blob = await put(filename, buffer, {
  access: "public", // or private + signed URLs — evaluate
  contentType: mimeType,
});
```

---

## Document Extraction Service

**Create:** `src/server/services/documentExtractService.ts`

### Recommended libraries

| Format | Library | Runtime | Purpose |
|--------|---------|---------|---------|
| PDF text | [`unpdf`](https://github.com/unjs/unpdf) | Node.js | Serverless-friendly PDF.js wrapper |
| EPUB text | [`epub2`](https://www.npmjs.com/package/epub2) | Node.js | Metadata + per-chapter XHTML |
| PDF view | [`react-pdf`](https://github.com/wojtekmaj/react-pdf) + `pdfjs-dist` | Browser | Canvas rendering |
| EPUB view | [`foliate-js`](https://github.com/johnfactotum/foliate-js) | Browser | Modern EPUB renderer |

**Avoid:** `pdf-parse` — breaks on Vercel serverless.

### Service interface

```typescript
interface DocumentExtractionResult {
  title?: string;
  author?: string;
  language?: string;
  plainText: string;
  pageCount?: number;
  chapterCount?: number;
  toc?: Array<{ title: string; href: string }>;
  hasTextLayer: boolean;
}

export async function extractDocument(
  buffer: Buffer,
  kind: "pdf" | "epub",
): Promise<DocumentExtractionResult>;
```

### PDF extraction

- Use `unpdf` to extract per-page text
- Join pages with `\n\n`
- Set `hasTextLayer: plainText.trim().length > 50`
- Compute `wordCount` / `readingTime` via existing helpers in `src/server/lib/articleWordCount.ts`

### EPUB extraction

- Read OPF metadata (title, author, language)
- Iterate spine chapters via `epub2`
- Strip XHTML → plain text (reuse JSDOM patterns from `src/server/services/paraTextConverter.ts`)
- Build TOC from `nav.xhtml` or NCX

### Failure handling

| Case | Behavior |
|------|----------|
| Scanned PDF (no text) | Save article, `extractionStatus: "skipped"`, viewer still works, TTS disabled |
| Corrupt file | `extractionStatus: "failed"`, show error + re-extract button |
| Password-protected PDF | Fail with clear user-facing message |
| Zip bomb (EPUB) | Reject at validation (max uncompressed ratio) |

Add colocated tests: `documentExtractService.test.ts` with fixture buffers.

---

## Viewing Layer

### Reader branching

**Current** (`src/app/_components/article-reader.tsx`):

```tsx
{isPdf ? (
  <ArticlePdfPlaceholder url={article.url} title={article.title} />
) : (
  <ArticleContent content={article.content} ... />
)}
```

**Target:**

```tsx
{contentKind === "pdf" && (
  <PdfViewer
    articleId={article.id}
    streamUrl={`/api/documents/${article.id}/stream`}
    initialPage={metadata.readingPosition?.page}
    onPageChange={saveReadingPosition}
  />
)}
{contentKind === "epub" && (
  <EpubViewer
    articleId={article.id}
    streamUrl={`/api/documents/${article.id}/stream`}
    initialCfi={metadata.readingPosition?.cfi}
    fontSize={fontSize}
    onLocationChange={saveReadingPosition}
  />
)}
{contentKind === "html" && <ArticleContent ... />}
```

Also update `src/app/_components/public-article-reader.tsx` for shared links.

### PdfViewer (`src/app/_components/pdf-viewer.tsx`)

- `"` only:`const PdfViewer = dynamic(() => import("./pdf-viewer"), { ssr: false });`
- Configure PDF.js worker — copy `pdf.worker.min.mjs` to `public/` (avoids Vercel MIME/404 issues):

```typescript
import { pdfjs } from "react-pdf";
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
```

- Virtualize pages (render visible ± 1)
- Toolbar: prev/next page, page input, zoom in/out, fit width
- Keyboard: ←/→ pages, +/- zoom
- Mobile: pinch zoom, swipe pages

**pnpm note:** Add `public-hoist-pattern[]=pdfjs-dist` to `.npmrc` if using `import.meta.url` worker pattern instead of public copy.

### EpubViewer (`src/app/_components/epub-viewer.tsx`)

- Client-only dynamic import
- Use foliate-js in a sandboxed container
- Never inject spine HTML into TipTap or `ArticleContent`
- Toolbar: prev/next chapter, TOC drawer, font size (reuse reader font control)
- Progress from location percentage

### Document stream API

**Create:** `src/app/api/documents/[articleId]/stream/route.ts`

- Session auth (or share token for `/shared/[token]` pages)
- Verify article ownership
- Stream from Vercel Blob (`metadata.blobUrl`) or proxy remote URL if not mirrored
- Headers: `Content-Type`, `Content-Disposition: inline`, `Cache-Control: private`
- Support `Range` requests for large PDFs
- Set `maxDuration` appropriately

---

## Feature Integration

### Search

`src/server/services/searchService.ts` already searches `articles.content`. Once PDF/EPUB text is extracted, search works with no code changes.

### TTS

**Current block** in `src/server/api/routers/tts.ts`:

```typescript
if (isPdfArticle(article)) {
  throw new TRPCError({ message: PDF_UNSUPPORTED_TTS_MESSAGE });
}
```

**Replace with:**

```typescript
if (isDocumentArticle(article) && !hasExtractedText(article)) {
  throw new TRPCError({
    message: "No text layer available — Listen isn't supported for this document.",
  });
}
```

Add helpers in `src/lib/article-content-kind.ts`:

```typescript
export function isEpubArticle(article: { metadata?: unknown }): boolean;
export function isDocumentArticle(article: { metadata?: unknown }): boolean; // pdf | epub
export function hasExtractedText(article: { content: string; metadata?: unknown }): boolean;
```

Pipe extracted plain text through existing TTS chunking in `src/server/services/tts.ts`.

### PAR\ PARA

Same pattern in `src/server/services/paraExportService.ts` — replace `isPdfArticle` guard with `isDocumentArticle && !hasExtractedText`.

Update messages in `src/lib/article-content-kind.ts`:

```typescript
export const DOCUMENT_UNSUPPORTED_PARA_MESSAGE = "...";
export const DOCUMENT_UNSUPPORTED_TTS_MESSAGE = "...";
```

### Highlights & TOC

| Feature | HTML | PDF (v1) | EPUB (v1) |
|---------|------|----------|-----------|
| CSS highlights | ✅ | ❌ | ❌ |
| TOC | Headings scan | Page list | EPUB nav |
| Standalone notes | ✅ | ✅ | ✅ |

Keep highlight toolbar hidden for PDF/EPUB in v1 (same as current PDF behavior).

### Public sharing

- Shared page at `/shared/[token]` should render PDF/EPUB viewers
- Stream endpoint must accept share token auth
- Do not expose raw blob URLs in API responses

---

## Security

| Risk | Mitigation |
|------|------------|
| Wrong file type / malware | Magic-byte validation; reject MIME mismatch |
| Zip bombs (EPUB) | Max uncompressed ratio; size cap |
| PDF exploits | PDF.js in Web Worker; keep `pdfjs-dist` updated |
| EPUB XSS | foliate-js sandbox; never `dangerouslySetInnerHTML` for EPUB spine |
| SSRF on URL ingest | Block private IPs; cap redirects/size (extend existing fetch rules in `articleExtractor.ts`) |
| Unauthorized binary access | Stream API checks `userId`; blob paths scoped per user |
| DoS | Async extraction for large files; per-user quotas |
| CSP | Add `worker-src blob: 'self'` in `next.config.js` for PDF.js worker |

---

## API Surface

### tRPC (`src/server/api/routers/article.ts`)

| Procedure | Input | Description |
|-----------|-------|-------------|
| `createUploadSession` | `{ filename, mimeType, byteSize }` | Returns Vercel Blob upload token |
| `finalizeUpload` | `{ uploadId, blobUrl, folderId?, tags? }` | Validates, creates article, extracts |
| `reExtract` | `{ articleId }` | Re-run extraction on existing document |
| `updateReadingPosition` | `{ articleId, position }` | Persist progress in metadata jsonb |

Add Zod schemas in `src/schemas/article.ts`.

Existing `create` (URL) and `createFromText` unchanged — URL path gains EPUB detection + extraction.

### REST API v1

| Endpoint | Change |
|----------|--------|
| `POST /api/v1/articles` | Document URL imports return `extractionStatus` in response |
| `GET /api/v1/articles/:id` | Include `metadata.extractionStatus`, `contentKind` |
| `POST /api/v1/articles/upload` | New — for external clients (Raycast, MCP) |

Update `src/server/lib/openapiSpec.ts` if adding REST endpoints.

### MCP

Update tool description in `packages/ril-core/src/mcp.ts` to mention PDF/EPUB URL support.

---

## UI Changes

### Add Article form (`src/app/_components/add-article-form.tsx`)

Currently toggles URL ↔ text. Add a third mode:

```
[ Link ]  [ Text ]  [ File ]
```

File tab:
- Drag-and-drop zone
- Accept `.pdf`, `.epub`
- Upload progress bar
- On success → navigate to `/article/[id]`

Wire through `AddArticleFormCard.tsx` and tRPC mutations.

### Article list

- `src/app/_components/pdf-badge.tsx` — exists
- Create `src/app/_components/epub-badge.tsx`
- Show extraction status chip on cards: "Processing…", "No text layer", "Failed"

### Reader

- Replace `ArticlePdfPlaceholder` with `PdfViewer` once stream works
- Keep "Open original" + "Download" in overflow menu
- Show extraction warning banner when `hasTextLayer === false`
- Hide HTML-specific TOC for PDF/EPUB; show format-specific navigation

---

## New Dependencies

```json
{
  "dependencies": {
    "react-pdf": "^9.x",
    "pdfjs-dist": "^4.x",
    "unpdf": "^0.x",
    "epub2": "^3.x"
  }
}
```

EPUB viewer: evaluate foliate-js bundle size — may need vendoring or dynamic import.

Install with `pnpm add react-pdf pdfjs-dist unpdf epub2`.

---

## Phased Implementation

Implement in order. Each phase should pass `pnpm check` and `pnpm test`.

### Phase 1 — PDF viewing (URL-saved PDFs)

**Goal:** In-app PDF viewer for existing URL imports. No extraction yet.

**Tasks:**

1. Create `src/app/api/documents/[articleId]/stream/route.ts`
   - Auth check, proxy remote PDF URL from `article.url`
2. Create `src/app/_components/pdf-viewer.tsx`
   - react-pdf, dynamic import, worker in `public/`
3. Update `src/app/_components/article-reader.tsx`
   - Replace `ArticlePdfPlaceholder` with `PdfViewer` when stream works
4. Update `src/app/_components/public-article-reader.tsx` similarly
5. Add CSP `worker-src` in `next.config.js` if needed

**Acceptance criteria:**
- Existing PDF URL articles render in-app with page navigation
- "Open original" still available as fallback
- TTS/PARA still blocked (unchanged)

### Phase 2 — Text extraction

**Goal:** Search, TTS, PARA for PDFs.

**Tasks:**

1. Create `src/server/services/documentExtractService.ts` with `unpdf`
2. Add tests with PDF fixture buffers
3. Extend `articleExtractor.ts` PDF path to call extract service
4. Populate `content`, `wordCount`, `readingTime`, `pageCount`, `extractionStatus`
5. Update `src/lib/article-content-kind.ts` — add `isDocumentArticle`, `hasExtractedText`
6. Relax guards in `tts.ts` and `paraExportService.ts`
7. Add `article.reExtract` tRPC procedure
8. Show extraction status in reader UI

**Acceptance criteria:**
- PDF URL articles have searchable text in `content`
- TTS works for text-based PDFs
- PARA sync works for text-based PDFs
- Scanned PDFs show "no text layer" warning, viewer still works

### Phase 3 — File upload + EPUB

**Goal:** Upload UI, Blob storage, EPUB support end-to-end.

**Tasks:**

1. Create `src/lib/epub-detection.ts` + tests
2. Add EPUB extraction to `documentExtractService.ts` via `epub2`
3. Extend `ArticleContentKind` and `ArticleMetadata` types
4. Add tRPC: `createUploadSession`, `finalizeUpload`
5. Add file upload tab to `AddArticleForm`
6. Mirror URL-fetched documents to Blob (optional but recommended)
7. Create `src/app/_components/epub-viewer.tsx` with foliate-js
8. Create `src/app/_components/epub-badge.tsx`
9. Extend `articleExtractor.ts` for EPUB URL detection
10. Update reader branching for EPUB

**Acceptance criteria:**
- User can upload PDF and EPUB files
- User can save EPUB URLs
- Both render in-app
- Text extracted for search/TTS/PARA

### Phase 4 — Polish

- `updateReadingPosition` tRPC + client persistence
- Async extraction queue for files > 10 MB
- REST upload endpoint for external clients
- Full-text search via Postgres `tsvector` (if needed)
- OCR path for scanned PDFs (future)

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/server/services/documentExtractService.ts` | PDF/EPUB text + metadata extraction |
| `src/server/services/documentExtractService.test.ts` | Extraction tests |
| `src/lib/epub-detection.ts` | EPUB magic bytes, content-type, URL heuristics |
| `src/lib/epub-detection.test.ts` | Detection tests |
| `src/app/_components/pdf-viewer.tsx` | Client-only PDF renderer |
| `src/app/_components/epub-viewer.tsx` | Client-only EPUB renderer |
| `src/app/_components/epub-badge.tsx` | List card badge |
| `src/app/api/documents/[articleId]/stream/route.ts` | Auth-gated binary stream |
| `public/pdf.worker.min.mjs` | PDF.js worker (copy from pdfjs-dist) |

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/article.ts` | Add `"epub"` to `ArticleContentKind`; extend `ArticleMetadata` |
| `src/lib/article-content-kind.ts` | Add `isEpubArticle`, `isDocumentArticle`, `hasExtractedText`; update messages |
| `src/lib/article-content-kind.test.ts` | Tests for new helpers |
| `src/server/services/articleExtractor.ts` | EPUB detection; call extract service for pdf/epub |
| `src/server/services/articleService.ts` | Upload finalize, reExtract helpers |
| `src/server/api/routers/article.ts` | New tRPC procedures |
| `src/schemas/article.ts` | Zod schemas for upload/reExtract/readingPosition |
| `src/app/_components/article-reader.tsx` | Branch to PdfViewer/EpubViewer |
| `src/app/_components/public-article-reader.tsx` | Same viewer branching |
| `src/app/_components/add-article-form.tsx` | File upload tab |
| `src/app/_components/AddArticleFormCard.tsx` | Wire upload mutations |
| `src/server/services/tts.ts` | Relax PDF guard |
| `src/server/api/routers/tts.ts` | Update error message logic |
| `src/server/services/paraExportService.ts` | Relax PDF guard |
| `next.config.js` | CSP worker-src if needed |
| `.npmrc` | `public-hoist-pattern[]=pdfjs-dist` if needed |

---

## Testing Guidance

- Colocate tests as `*.test.ts` next to source files
- Run single test: `npx vitest run src/server/services/documentExtractService.test.ts`
- Tests use `node` environment with `SKIP_ENV_VALIDATION=true`
- For PDF/EPUB fixtures, add small test files under a `fixtures/` directory or inline buffers
- Test detection edge cases mirroring `src/lib/pdf-detection.test.ts` patterns
- Test that `hasExtractedText` correctly gates TTS/PARA
- Test stream route auth (session required, share token works, wrong user rejected)

**Pre-merge:** Always run `pnpm check && pnpm test`.

---

## Open Decisions (resolve during implementation)

| Question | Options | Recommendation |
|----------|---------|----------------|
| Mirror all URL PDFs to Blob? | Always / on-demand / never | On first view or at ingest if CORS fails |
| Async extraction? | Sync ≤10MB, async above | Sync for v1 ≤10MB |
| Blob access | Public / private + signed URLs | Start public (matches TTS); tighten later |
| EPUB viewer lib | epub.js vs foliate-js | foliate-js |
| Max file size | 25 / 50 / 100 MB | 50 MB |
| Share PDF/EPUB publicly? | Yes / no | Yes — stream via share token |

---

## Success Criteria

- [ ] PDF URL articles open in-app (not placeholder) — target 95%+ of saved PDFs
- [ ] EPUB URL and upload articles open in-app
- [ ] Extracted text is searchable via existing search
- [ ] TTS works for documents with text layers
- [ ] PARA sync works for documents with text layers
- [ ] Scanned PDFs: viewer works, TTS gracefully disabled with clear message
- [ ] No SSRF/XSS regressions from document handling
- [ ] `pnpm check && pnpm test` pass

---

## Reference: Current PDF Placeholder

The placeholder being replaced lives at `src/app/_components/article-pdf-placeholder.tsx`. It shows "This link is a PDF" with an "Open original PDF" button. Phase 1 replaces this with an in-app viewer while keeping the external link as a fallback action.

## Reference: Current PDF Extraction Stub

```typescript
// src/server/services/articleExtractor.ts — getPdfExtractionData()
return {
  title,
  content: "",           // ← this is why PDFs are unsearchable
  excerpt: "PDF document",
  wordCount: 0,
  readingTime: 0,
  metadata: { contentKind: "pdf", ... },
};
```

Phase 2 fills `content` with extracted plain text.
