import { sql } from "drizzle-orm";
import { JSDOM } from "jsdom";
import type { db } from "~/server/db";
import { createAnnotationProjector } from "~/lib/annotation-anchor";
import { createNativeLibraryDocument } from "~/lib/native-library-document";
import type {
  SourceAnchor,
  NativeAnnotationMutation,
  NativeAnnotationSnapshot,
  NativeNote,
  NativeHighlight,
} from "~/lib/native-annotations";
import {
  NATIVE_LIBRARY_ARTICLE_BYTES,
  NATIVE_LIBRARY_HTML_BYTES,
  type NativeLibraryMutationResult,
} from "~/lib/native-library";
import { NativeLibraryError } from "../native-library/errors";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type HighlightRow = {
  id: string;
  articleId: string;
  color: NativeHighlight["color"];
  text: string;
  startOffset: number;
  endOffset: number;
  contextPrefix: string | null;
  contextSuffix: string | null;
  anchorContentHash: string | null;
  anchorSpace: SourceAnchor["space"];
  sourceAnchor: SourceAnchor | null;
  createdAt: string;
  updatedAt: string;
};
function projections(html: string) {
  const dom = new JSDOM("<!doctype html><body></body>");
  try {
    dom.window.document.body.innerHTML = html;
    return createAnnotationProjector(
      createNativeLibraryDocument(dom.window.document.body),
      dom.window.document.body.textContent ?? "",
    );
  } finally {
    dom.window.close();
  }
}
function sourceFromRow(row: HighlightRow): SourceAnchor {
  if (row.sourceAnchor) return row.sourceAnchor;
  return {
    space: row.anchorSpace,
    text: row.text,
    startOffset: row.startOffset,
    endOffset: row.endOffset,
    contextPrefix: row.contextPrefix ?? "",
    contextSuffix: row.contextSuffix ?? "",
    contentHash: row.anchorContentHash ?? "",
  };
}

/** Same MVCC transaction as the parent change. Never truncate a collection. */
export async function readNativeAnnotations(
  tx: Transaction,
  owner: string,
  articleId: string,
  html: string | null,
  changeBytes: number,
): Promise<NativeAnnotationSnapshot> {
  const unavailable = { complete: false, reason: "annotation_limit" } as const;
  const remaining =
    NATIVE_LIBRARY_ARTICLE_BYTES -
    changeBytes -
    Buffer.byteLength(',"annotations":');
  // A cheap lower bound avoids transferring unbounded web-written values.
  // The final exact JSON measurement includes projections, escaping and envelope.
  const [budget] = await tx.execute<{ bytes: string }>(sql`
    SELECT COALESCE(sum(bytes), 0)::text AS bytes FROM (
      SELECT 36 + octet_length(n.content) AS bytes
      FROM "read-it-later_note" n
      JOIN "read-it-later_native_annotation" l ON l.owner_id = n."userId" AND l.kind = 'note' AND l.id = n.id AND l.article_id = n."articleId" AND NOT l.deleted
      WHERE n."userId" = ${owner} AND n."articleId" = ${articleId}::uuid
        AND (n."highlightId" IS NULL OR EXISTS (SELECT 1 FROM "read-it-later_highlight" h WHERE h.id = n."highlightId" AND h."userId" = ${owner} AND h."articleId" = n."articleId"))
      UNION ALL
      SELECT 36 + CASE WHEN h."sourceAnchor" IS NULL
        THEN octet_length(h.text) + octet_length(COALESCE(h."contextPrefix", '')) + octet_length(COALESCE(h."contextSuffix", ''))
        ELSE greatest(0, octet_length(h."sourceAnchor"::text) - 128) END
      FROM "read-it-later_highlight" h
      JOIN "read-it-later_native_annotation" l ON l.owner_id = h."userId" AND l.kind = 'highlight' AND l.id = h.id AND l.article_id = h."articleId" AND NOT l.deleted
      WHERE h."userId" = ${owner} AND h."articleId" = ${articleId}::uuid
      UNION ALL
      SELECT 36 FROM "read-it-later_native_annotation"
      WHERE owner_id = ${owner} AND article_id = ${articleId}::uuid AND deleted
    ) entries
  `);
  if (Number(budget?.bytes ?? 0) > remaining) return unavailable;
  const notes = await tx.execute<NativeNote & Record<string, unknown>>(sql`
    SELECT n.id, n."articleId", n."highlightId", n.content, n."createdAt"::text AS "createdAt", n."updatedAt"::text AS "updatedAt"
    FROM "read-it-later_note" n
    JOIN "read-it-later_native_annotation" l ON l.owner_id = n."userId" AND l.kind = 'note' AND l.id = n.id AND l.article_id = n."articleId" AND NOT l.deleted
    WHERE n."userId" = ${owner} AND n."articleId" = ${articleId}::uuid
      AND (n."highlightId" IS NULL OR EXISTS (SELECT 1 FROM "read-it-later_highlight" h WHERE h.id = n."highlightId" AND h."userId" = ${owner} AND h."articleId" = n."articleId"))
    ORDER BY n.id
  `);
  const rows = await tx.execute<HighlightRow>(sql`
    SELECT h.id, h."articleId", h.color, h.text, h."startOffset", h."endOffset", h."contextPrefix", h."contextSuffix", h."anchorContentHash", h."anchorSpace", h."sourceAnchor", h."createdAt"::text AS "createdAt", h."updatedAt"::text AS "updatedAt"
    FROM "read-it-later_highlight" h
    JOIN "read-it-later_native_annotation" l ON l.owner_id = h."userId" AND l.kind = 'highlight' AND l.id = h.id AND l.article_id = h."articleId" AND NOT l.deleted
    WHERE h."userId" = ${owner} AND h."articleId" = ${articleId}::uuid ORDER BY h.id
  `);
  const deleted = await tx.execute<{
    kind: "note" | "highlight";
    id: string;
  }>(sql`
    SELECT kind, id FROM "read-it-later_native_annotation"
    WHERE owner_id = ${owner} AND article_id = ${articleId}::uuid AND deleted ORDER BY kind, id
  `);
  const mapping = html === null || !rows.length ? null : projections(html);
  const highlights: NativeHighlight[] = rows.map((row) => {
    const sourceAnchor = sourceFromRow(row);
    const derived = mapping
      ? mapping(sourceAnchor)
      : { canonicalAnchor: null, resolution: "unresolved" as const };
    return {
      id: row.id,
      articleId: row.articleId,
      color: row.color,
      sourceAnchor,
      canonicalAnchor: derived.canonicalAnchor,
      resolution: derived.resolution,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    };
  });
  const snapshot: NativeAnnotationSnapshot = {
    complete: true,
    notes: notes.map((row) => ({
      ...row,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    })),
    highlights,
    deleted: [...deleted],
  };
  return Buffer.byteLength(JSON.stringify(snapshot)) <= remaining
    ? snapshot
    : unavailable;
}

/** Called only inside the library owner lock + durable receipt transaction. */
export async function applyNativeAnnotationMutation(
  tx: Transaction,
  owner: string,
  articleId: string,
  mutation: NativeAnnotationMutation,
): Promise<NativeLibraryMutationResult> {
  const kind = mutation.kind.startsWith("note.") ? "note" : "highlight";
  const annotationId =
    "noteId" in mutation ? mutation.noteId : mutation.highlightId;
  const result = (
    status: "applied" | "deleted",
  ): NativeLibraryMutationResult => ({
    mutationId: mutation.mutationId,
    articleId,
    annotationId,
    status,
  });
  const [parent] = await tx.execute<{ content: string | null }>(sql`
    SELECT CASE WHEN octet_length(content) <= ${NATIVE_LIBRARY_HTML_BYTES} THEN content ELSE NULL END AS content
    FROM "read-it-later_article" WHERE id = ${articleId}::uuid AND "userId" = ${owner} FOR SHARE
  `);
  const table =
    kind === "note"
      ? sql`"read-it-later_note"`
      : sql`"read-it-later_highlight"`;
  const [existing] = await tx.execute<{ id: string }>(sql`
    SELECT id FROM ${table}
    WHERE id = ${annotationId}::uuid AND "userId" = ${owner} AND "articleId" = ${articleId}::uuid FOR UPDATE
  `);
  const [tombstone] = await tx.execute<{ deleted: boolean }>(sql`
    SELECT true AS deleted FROM "read-it-later_native_annotation"
    WHERE owner_id = ${owner} AND kind = ${kind} AND id = ${annotationId}::uuid AND deleted
      AND (article_id = ${articleId}::uuid OR ${!existing}) LIMIT 1
  `);
  if (tombstone) return result("deleted");
  // Check occupancy without selecting or locking another owner's row. A global
  // UUID collision can never become an alias or target for a field assignment.
  if (!existing) {
    const [occupied] = await tx.execute<{ present: boolean }>(sql`
      SELECT true AS present FROM ${table} WHERE id = ${annotationId}::uuid
    `);
    if (occupied) throw new NativeLibraryError("annotation_conflict", 409);
  }
  const markDeleted = async () => {
    await tx.execute(sql`
      INSERT INTO "read-it-later_native_annotation" (owner_id, kind, id, article_id, deleted)
      VALUES (${owner}, ${kind}, ${annotationId}::uuid, ${articleId}::uuid, true)
      ON CONFLICT (owner_id, kind, id, article_id) DO UPDATE SET deleted = true
    `);
    if (parent)
      await tx.execute(
        sql`SELECT native_annotation_touch_parent(${owner}, ${articleId}::uuid)`,
      );
    return result("deleted");
  };
  if (!parent) return markDeleted();
  if (mutation.kind === "note.delete" || mutation.kind === "highlight.delete") {
    if (existing) {
      await tx.execute(
        sql`DELETE FROM ${table} WHERE id = ${annotationId}::uuid AND "userId" = ${owner} AND "articleId" = ${articleId}::uuid`,
      );
      return result("deleted");
    }
    return markDeleted();
  }
  if (mutation.kind === "note.update") {
    if (!existing) return markDeleted();
    await tx.execute(
      sql`UPDATE "read-it-later_note" SET content = ${mutation.patch.content}, "updatedAt" = clock_timestamp() WHERE id = ${annotationId}::uuid AND "userId" = ${owner} AND "articleId" = ${articleId}::uuid`,
    );
  } else if (mutation.kind === "highlight.update") {
    if (!existing) return markDeleted();
    await tx.execute(
      sql`UPDATE "read-it-later_highlight" SET color = ${mutation.patch.color}, "updatedAt" = clock_timestamp() WHERE id = ${annotationId}::uuid AND "userId" = ${owner} AND "articleId" = ${articleId}::uuid`,
    );
  } else if (mutation.kind === "note.create") {
    if (existing) return result("applied");
    if (mutation.highlightId) {
      const [highlight] = await tx.execute<{ id: string }>(
        sql`SELECT id FROM "read-it-later_highlight" WHERE id = ${mutation.highlightId}::uuid AND "userId" = ${owner} AND "articleId" = ${articleId}::uuid FOR SHARE`,
      );
      if (!highlight) {
        const [gone] = await tx.execute<{ id: string }>(
          sql`SELECT id FROM "read-it-later_native_annotation" WHERE owner_id = ${owner} AND article_id = ${articleId}::uuid AND kind = 'highlight' AND id = ${mutation.highlightId}::uuid AND deleted`,
        );
        if (gone) return markDeleted();
        throw new NativeLibraryError("invalid_annotation_relationship", 409);
      }
    }
    const inserted = await tx.execute(
      sql`INSERT INTO "read-it-later_note" (id, "userId", "articleId", "highlightId", content) VALUES (${annotationId}::uuid, ${owner}, ${articleId}::uuid, ${mutation.highlightId ?? null}::uuid, ${mutation.content}) ON CONFLICT (id) DO NOTHING RETURNING id`,
    );
    if (!inserted.length)
      throw new NativeLibraryError("annotation_conflict", 409);
  } else {
    if (existing) return result("applied");
    const source = mutation.sourceAnchor;
    const mapping =
      parent.content === null ? null : projections(parent.content);
    const webAnchor = mapping ? mapping(source).webAnchor : null;
    const inserted = await tx.execute(sql`
      INSERT INTO "read-it-later_highlight" (id, "userId", "articleId", color, text, "startOffset", "endOffset", "contextPrefix", "contextSuffix", "anchorContentHash", "anchorSpace", "sourceAnchor", "webAnchor", anchor_status)
      VALUES (${annotationId}::uuid, ${owner}, ${articleId}::uuid, ${mutation.color}, ${source.text}, ${source.startOffset}, ${source.endOffset}, ${source.contextPrefix}, ${source.contextSuffix}, ${source.contentHash}, ${source.space}, ${JSON.stringify(source)}::jsonb, ${webAnchor === null ? null : JSON.stringify(webAnchor)}::jsonb, ${webAnchor ? "anchored" : "lost"})
      ON CONFLICT (id) DO NOTHING RETURNING id
    `);
    if (!inserted.length)
      throw new NativeLibraryError("annotation_conflict", 409);
  }
  return result("applied");
}
