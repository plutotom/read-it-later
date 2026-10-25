import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import {
  NATIVE_LIBRARY_ARTICLE_BYTES,
  NATIVE_LIBRARY_HTML_BYTES,
  NATIVE_LIBRARY_PAGE_BYTES,
  NATIVE_LIBRARY_TITLE_CHARACTERS,
  NATIVE_LIBRARY_URL_BYTES,
  nativeLibraryMutationsSchema,
  type NativeLibraryChange,
  type NativeArticleMutation,
  type NativeLibraryMutationResult,
} from "~/lib/native-library";
import {
  nativeLibraryDocumentFromHtml,
  nativeLibraryTextToHtml,
  NATIVE_LIBRARY_FORMAT,
} from "~/lib/native-library-document";
import { readNativeLibraryCursor, signNativeLibraryCursor } from "./cursor";
import { NativeLibraryError } from "./errors";
import {
  applyNativeAnnotationMutation,
  readNativeAnnotations,
} from "../native-annotations/service";

type Database = typeof db;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type ArticleRow = {
  id: string;
  revision: string;
  deleted: boolean;
  url: string | null;
  title: string | null;
  content: string | null;
  oversized: boolean;
  oversizedURL: boolean;
  isRead: boolean;
  isFavorite: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

function stableJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJSON(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isReadableLibraryURL(value: string): boolean {
  // Read compatibility is broader than native create's public-URL policy:
  // existing HTTP(S) links may point at internal hosts, and manual text is valid.
  // Check the original authority too: URL normalizes empty userinfo away, while
  // the native client's URLComponents rejects even an empty user/password.
  const authority = /^(?:https?|text):\/\/([^/?#]*)/iu.exec(value)?.[1];
  if (
    !authority ||
    authority.includes("@") ||
    /[\u0000-\u0020\u007f\\]/u.test(value)
  )
    return false;
  try {
    const url = new URL(value);
    return !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}

function changeFromRow(row: ArticleRow): NativeLibraryChange {
  if (row.deleted)
    return { id: row.id, revision: row.revision, deleted: true, article: null };
  // The server ID is authoritative. Keep pathological source URLs on the server
  // and send an explicit unavailable representation rather than pin the feed.
  if (
    (!row.oversized && row.content === null) ||
    (!row.oversizedURL && row.url === null) ||
    row.title === null
  )
    throw new Error("Library ledger and article state disagree");
  const unavailableURL =
    row.oversizedURL || !isReadableLibraryURL(row.url ?? "");
  const unavailable = row.oversized || unavailableURL;
  const document = unavailable
    ? {
        text: "",
        contentHash: createHash("sha256").update("").digest("hex"),
        format: NATIVE_LIBRARY_FORMAT,
      }
    : nativeLibraryDocumentFromHtml(row.content ?? "");
  const change: NativeLibraryChange = {
    id: row.id,
    revision: row.revision,
    deleted: false,
    article: {
      id: row.id,
      url: unavailableURL ? `text://unavailable/${row.id}` : (row.url ?? ""),
      title: row.title,
      text: document.text,
      ...(unavailable ? { contentUnavailable: true } : {}),
      contentHash: document.contentHash,
      format: document.format,
      isRead: row.isRead,
      isFavorite: row.isFavorite,
      isArchived: row.isArchived,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    },
  };
  if (
    Buffer.byteLength(JSON.stringify(change)) > NATIVE_LIBRARY_ARTICLE_BYTES
  ) {
    // Oversized extracted/JSON-escaped text must not pin the feed cursor. The
    // empty hash describes this representation, not a replacement for client text.
    const article = change.article;
    if (!article) throw new Error("Expected live library article");
    article.text = "";
    article.contentHash = createHash("sha256").update("").digest("hex");
    article.contentUnavailable = true;
  }
  return change;
}

export async function pullNativeLibrary(
  owner: string,
  options: {
    cursor?: string;
    limit?: number;
    secret: string;
    protocolVersion?: 1 | 2;
  },
  database: Database = db,
) {
  const protocolVersion = options.protocolVersion ?? 1;
  if (protocolVersion !== 1 && protocolVersion !== 2)
    throw new NativeLibraryError("invalid_protocol", 400);
  const after = readNativeLibraryCursor(options.cursor, owner, options.secret);
  const limit = options.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new NativeLibraryError("invalid_limit", 400);
  // One MVCC snapshot per page. A subsequent page is a new current-state view,
  // not a claim to retain a historical snapshot across HTTP requests.
  return database.transaction(
    async (tx) => {
      const [state] = await tx.execute<{ revision: string }>(sql`
        SELECT revision::text FROM "read-it-later_native_library_owner"
        WHERE owner_id = ${owner}
      `);
      const highWater = state?.revision ?? "0";
      if (BigInt(after) > BigInt(highWater))
        throw new NativeLibraryError("invalid_cursor", 400);
      const rows = await tx.execute<ArticleRow>(sql`
        SELECT c.article_id AS id, c.revision::text AS revision, c.deleted,
          CASE WHEN octet_length(a.url) <= ${NATIVE_LIBRARY_URL_BYTES}
            THEN a.url ELSE NULL END AS url,
          -- Only display metadata may be shortened; canonical URL/text identity
          -- and the stored title remain untouched. LEFT counts Unicode characters.
          LEFT(a.title, ${NATIVE_LIBRARY_TITLE_CHARACTERS}) AS title,
          CASE WHEN octet_length(a.content) <= ${NATIVE_LIBRARY_HTML_BYTES}
            THEN a.content ELSE NULL END AS content,
          (octet_length(a.content) > ${NATIVE_LIBRARY_HTML_BYTES}) AS oversized,
          (octet_length(a.url) > ${NATIVE_LIBRARY_URL_BYTES}) AS "oversizedURL",
          a."isRead", a."isFavorite", a."isArchived",
          a."createdAt"::text AS "createdAt", a."updatedAt"::text AS "updatedAt"
        FROM "read-it-later_native_library_change" c
        LEFT JOIN "read-it-later_article" a ON a.id = c.article_id AND a."userId" = c.owner_id
        WHERE c.owner_id = ${owner} AND c.revision > ${after}::bigint
        ORDER BY c.revision LIMIT ${limit + 1}
      `);
      const changes: NativeLibraryChange[] = [];
      let bytes = 4096; // bounded envelope and signed cursor overhead
      for (const row of rows.slice(0, limit)) {
        const change = changeFromRow(row);
        if (protocolVersion === 2 && !change.deleted) {
          change.annotations = await readNativeAnnotations(
            tx,
            owner,
            row.id,
            change.article?.contentUnavailable ? null : row.content,
            Buffer.byteLength(JSON.stringify(change)),
          );
          // The explicit unavailable envelope also counts against the per-change
          // bound. Retain protocol-1's article representation whenever it fits.
          if (
            Buffer.byteLength(JSON.stringify(change)) >
              NATIVE_LIBRARY_ARTICLE_BYTES &&
            change.article
          ) {
            change.article.text = "";
            change.article.contentHash = createHash("sha256")
              .update("")
              .digest("hex");
            change.article.contentUnavailable = true;
            if (change.annotations.complete) {
              for (const highlight of change.annotations.highlights) {
                highlight.canonicalAnchor = null;
                highlight.resolution = "unresolved";
              }
            }
          }
        }
        const size = Buffer.byteLength(JSON.stringify(change));
        if (bytes + size > NATIVE_LIBRARY_PAGE_BYTES) break;
        changes.push(change);
        bytes += size;
      }
      const hasMore = rows.length > changes.length;
      const revision = hasMore ? changes.at(-1)!.revision : highWater;
      return {
        protocolVersion,
        changes,
        cursor: signNativeLibraryCursor(owner, revision, options.secret),
        hasMore,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

async function tombstone(tx: Transaction, owner: string, articleId: string) {
  const [existing] = await tx.execute<{ deleted: boolean }>(sql`
    SELECT deleted FROM "read-it-later_native_library_change"
    WHERE owner_id = ${owner} AND article_id = ${articleId}::uuid
  `);
  if (existing?.deleted) return;
  await tx.execute(sql`
    WITH next AS (
      UPDATE "read-it-later_native_library_owner" SET revision = revision + 1
      WHERE owner_id = ${owner} RETURNING revision
    )
    INSERT INTO "read-it-later_native_library_change" (owner_id, article_id, revision, deleted)
      SELECT ${owner}, ${articleId}::uuid, revision, true FROM next
    ON CONFLICT (owner_id, article_id) DO UPDATE
      SET revision = EXCLUDED.revision, deleted = true
  `);
}

async function applyMutation(
  tx: Transaction,
  owner: string,
  mutation: NativeArticleMutation,
): Promise<NativeLibraryMutationResult> {
  const [alias] = await tx.execute<{ article_id: string }>(sql`
    SELECT article_id FROM "read-it-later_native_library_alias"
    WHERE owner_id = ${owner} AND local_id = ${mutation.articleId}::uuid
  `);
  let articleId = alias?.article_id ?? mutation.articleId;
  const result = (status: NativeLibraryMutationResult["status"]) => ({
    mutationId: mutation.mutationId,
    status,
    articleId,
  });
  const [ledger] = await tx.execute<{ deleted: boolean }>(sql`
    SELECT deleted FROM "read-it-later_native_library_change"
    WHERE owner_id = ${owner} AND article_id = ${articleId}::uuid
  `);
  if (ledger?.deleted) return result("deleted");
  if (mutation.kind === "create") {
    const fillPendingText = async (id: string) => {
      if (!mutation.text) return;
      // Only our own empty native placeholder may hydrate once. A web edit
      // that replaced its content also closes the fill path, even if it left
      // the private marker intact. Flags and annotations are never assigned.
      await tx.execute(sql`
        UPDATE "read-it-later_article"
        SET content = ${nativeLibraryTextToHtml(mutation.text)}, title = ${mutation.title},
          metadata = metadata - 'nativePendingText', "updatedAt" = clock_timestamp()
        WHERE id = ${id}::uuid AND "userId" = ${owner}
          AND metadata @> '{"nativePendingText":true}'::jsonb
          AND content = ${nativeLibraryTextToHtml("")}
      `);
    };
    const [byId] = await tx.execute<{ id: string; url: string }>(sql`
      SELECT id, url FROM "read-it-later_article"
      WHERE id = ${articleId}::uuid AND "userId" = ${owner}
    `);
    if (byId) {
      if (byId.url !== mutation.url)
        throw new NativeLibraryError("article_conflict", 409);
      await fillPendingText(byId.id);
      return result("applied");
    }
    const [duplicate] = await tx.execute<{ id: string }>(sql`
      SELECT id FROM "read-it-later_article"
      WHERE "userId" = ${owner} AND url = ${mutation.url}
      ORDER BY "createdAt", id LIMIT 1
    `);
    if (duplicate) {
      articleId = duplicate.id;
      // An unrelated owner's global UUID must never become our alias.
      const [occupied] = await tx.execute<{ present: boolean }>(sql`
        SELECT true AS present FROM "read-it-later_article" WHERE id = ${mutation.articleId}::uuid
      `);
      if (occupied) throw new NativeLibraryError("article_conflict", 409);
      await tx.execute(sql`
        INSERT INTO "read-it-later_native_library_alias" (owner_id, local_id, article_id)
        VALUES (${owner}, ${mutation.articleId}::uuid, ${articleId}::uuid)
      `);
      await fillPendingText(articleId);
      return result("applied");
    }
    const inserted = await tx.execute<{ id: string }>(sql`
      INSERT INTO "read-it-later_article"
        (id, "userId", url, title, content, "isRead", "isFavorite", metadata)
      VALUES (${articleId}::uuid, ${owner}, ${mutation.url}, ${mutation.title},
        ${nativeLibraryTextToHtml(mutation.text)}, ${mutation.isRead}, ${mutation.isFavorite},
        ${JSON.stringify(mutation.text ? {} : { nativePendingText: true })}::jsonb)
      ON CONFLICT (id) DO NOTHING RETURNING id
    `);
    if (!inserted.length) throw new NativeLibraryError("article_conflict", 409);
    return result("applied");
  }
  if (mutation.kind === "delete") {
    await tx.execute(sql`
      DELETE FROM "read-it-later_article" WHERE id = ${articleId}::uuid AND "userId" = ${owner}
    `);
    await tombstone(tx, owner, articleId);
    return result("deleted");
  }
  const patch = mutation.patch;
  const assignments = [sql`"updatedAt" = clock_timestamp()`];
  if (patch.isRead !== undefined)
    assignments.push(sql`"isRead" = ${patch.isRead}`);
  if (patch.isFavorite !== undefined)
    assignments.push(sql`"isFavorite" = ${patch.isFavorite}`);
  if (patch.isArchived !== undefined)
    assignments.push(sql`"isArchived" = ${patch.isArchived}`);
  const changed = await tx.execute<{ id: string }>(sql`
    UPDATE "read-it-later_article" SET ${sql.join(assignments, sql`, `)}
    WHERE id = ${articleId}::uuid AND "userId" = ${owner} RETURNING id
  `);
  if (!changed.length) {
    await tombstone(tx, owner, articleId);
    return result("deleted");
  }
  return result("applied");
}

export async function mutateNativeLibrary(
  owner: string,
  input: unknown,
  database: Database = db,
) {
  const parsed = nativeLibraryMutationsSchema.safeParse(input);
  if (!parsed.success) throw new NativeLibraryError("invalid_mutations", 400);
  // Web UPDATEs acquire article row locks before their trigger can acquire our
  // owner lock. Retry a deadlock victim's entire transaction, never a statement.
  for (let attempt = 0; ; attempt++) {
    try {
      return await database.transaction(async (tx) => {
        await tx.execute(sql`
          INSERT INTO "read-it-later_native_library_owner" (owner_id) VALUES (${owner})
          ON CONFLICT DO NOTHING
        `);
        await tx.execute(sql`
          SELECT revision FROM "read-it-later_native_library_owner"
          WHERE owner_id = ${owner} FOR UPDATE
        `);
        const results: NativeLibraryMutationResult[] = [];
        for (const mutation of parsed.data.mutations) {
          const hash = createHash("sha256")
            .update(stableJSON(mutation))
            .digest("hex");
          const [prior] = await tx.execute<{
            input_hash: string;
            result: NativeLibraryMutationResult;
          }>(sql`
            SELECT input_hash, result FROM "read-it-later_native_library_mutation"
            WHERE owner_id = ${owner} AND mutation_id = ${mutation.mutationId}::uuid
          `);
          if (prior) {
            if (prior.input_hash !== hash)
              throw new NativeLibraryError("mutation_conflict", 409);
            results.push(prior.result);
            continue;
          }
          let result: NativeLibraryMutationResult;
          if (
            mutation.kind === "create" ||
            mutation.kind === "update" ||
            mutation.kind === "delete"
          ) {
            result = await applyMutation(tx, owner, mutation);
          } else {
            const [alias] = await tx.execute<{ article_id: string }>(sql`
              SELECT article_id FROM "read-it-later_native_library_alias"
              WHERE owner_id = ${owner} AND local_id = ${mutation.articleId}::uuid
            `);
            result = await applyNativeAnnotationMutation(
              tx,
              owner,
              alias?.article_id ?? mutation.articleId,
              mutation,
            );
            // Capture each annotation's post-effect owner revision while the
            // same lock is held, before a later mutation in this batch runs.
            // No-op/deleted results carry the current fence too. Receipt replay
            // above returns the originally persisted fence without reading anew.
            const [effect] = await tx.execute<{ revision: string }>(sql`
              SELECT revision::text FROM "read-it-later_native_library_owner"
              WHERE owner_id = ${owner}
            `);
            if (!effect) throw new Error("Missing annotation owner revision");
            result.effectRevision = effect.revision;
            if (result.status === "deleted") {
              const table =
                "noteId" in mutation
                  ? sql`"read-it-later_note"`
                  : sql`"read-it-later_highlight"`;
              const annotationId =
                "noteId" in mutation ? mutation.noteId : mutation.highlightId;
              // Classify absence across this owner's parents, not merely the
              // requested relationship. A moved live entity is not permanently
              // deleted. The same owner lock protects this check and the fence.
              const [live] = await tx.execute<{ present: boolean }>(sql`
                SELECT true AS present FROM ${table}
                WHERE id = ${annotationId}::uuid AND "userId" = ${owner}
              `);
              result.permanentDeletion = !live;
            }
          }
          await tx.execute(sql`
            INSERT INTO "read-it-later_native_library_mutation" (owner_id, mutation_id, input_hash, result)
            VALUES (${owner}, ${mutation.mutationId}::uuid, ${hash}, ${JSON.stringify(result)}::jsonb)
          `);
          results.push(result);
        }
        // ACKs deliberately contain no cursor. Only atomic pull application on
        // the phone may advance its durable cursor.
        return { protocolVersion: parsed.data.protocolVersion, results };
      });
    } catch (error) {
      const cause = error instanceof Error && error.cause ? error.cause : error;
      const code =
        cause && typeof cause === "object" && "code" in cause
          ? cause.code
          : undefined;
      if (attempt < 3 && (code === "40P01" || code === "40001")) continue;
      throw error;
    }
  }
}
