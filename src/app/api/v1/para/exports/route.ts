import { RIL_READ_SCOPE, RIL_WRITE_SCOPE } from "~/lib/paraConstants";
import { paraExportCreateApiSchema } from "~/schemas/apiV1";
import { db } from "~/server/db";
import {
  ApiError,
  created,
  defineRoute,
  noContent,
  parseBody,
} from "~/server/lib/apiHandler";
import {
  createParaExport,
  listParaExports,
  removeParaExportByArticleId,
  serializeParaExportForApi,
  UnsupportedParaContentError,
} from "~/server/services/paraExportService";

export const GET = defineRoute(RIL_READ_SCOPE, async (ctx) => {
  const rows = await listParaExports(db, ctx.userId);
  return rows.map(serializeParaExportForApi);
});

export const POST = defineRoute(RIL_WRITE_SCOPE, async (ctx) => {
  const { articleId } = await parseBody(ctx, paraExportCreateApiSchema);
  try {
    const row = await createParaExport(db, ctx.userId, articleId);
    return created(serializeParaExportForApi(row));
  } catch (error) {
    if (error instanceof UnsupportedParaContentError) {
      throw new ApiError(400, "unsupported_content", error.message);
    }
    throw new ApiError(404, "not_found", "Article not found");
  }
});

export const DELETE = defineRoute(RIL_WRITE_SCOPE, async (ctx) => {
  const articleId = ctx.searchParams.get("articleId");
  if (!articleId) {
    throw new ApiError(
      400,
      "invalid_request",
      "Provide `articleId` as a query parameter",
    );
  }

  const success = await removeParaExportByArticleId(
    db,
    ctx.userId,
    articleId,
  );
  if (!success) {
    throw new ApiError(404, "not_found", "Export not found");
  }
  return noContent();
});
