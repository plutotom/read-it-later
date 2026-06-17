import { RIL_WRITE_SCOPE } from "~/lib/paraConstants";
import { db } from "~/server/db";
import {
  ApiError,
  defineRoute,
  noContent,
  parseBody,
} from "~/server/lib/apiHandler";
import {
  deleteHighlight,
  updateHighlight,
} from "~/server/services/annotationService";
import { highlightUpdateApiSchema } from "~/schemas/apiV1";

export const PATCH = defineRoute(RIL_WRITE_SCOPE, async (ctx) => {
  const patch = await parseBody(ctx, highlightUpdateApiSchema);
  const updated = await updateHighlight(db, ctx.userId, ctx.param("id"), patch);
  if (!updated) throw new ApiError(404, "not_found", "Highlight not found");
  return updated;
});

export const DELETE = defineRoute(RIL_WRITE_SCOPE, async (ctx) => {
  const success = await deleteHighlight(db, ctx.userId, ctx.param("id"));
  if (!success) throw new ApiError(404, "not_found", "Highlight not found");
  return noContent();
});
