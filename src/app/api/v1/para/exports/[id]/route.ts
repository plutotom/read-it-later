import { RIL_WRITE_SCOPE } from "~/lib/paraConstants";
import { db } from "~/server/db";
import { ApiError, defineRoute, noContent } from "~/server/lib/apiHandler";
import { removeParaExportById } from "~/server/services/paraExportService";

export const DELETE = defineRoute(RIL_WRITE_SCOPE, async (ctx) => {
  const success = await removeParaExportById(db, ctx.userId, ctx.param("id"));
  if (!success) {
    throw new ApiError(404, "not_found", "Export not found");
  }
  return noContent();
});
