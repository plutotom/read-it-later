import { RIL_READ_SCOPE, RIL_WRITE_SCOPE } from "~/lib/paraConstants";
import { db } from "~/server/db";
import {
  ApiError,
  defineRoute,
  noContent,
  parseBody,
} from "~/server/lib/apiHandler";
import {
  deleteFolder,
  getFolder,
  updateFolder,
} from "~/server/services/folderService";
import { folderUpdateApiSchema } from "~/schemas/apiV1";

export const GET = defineRoute(RIL_READ_SCOPE, async (ctx) => {
  const folder = await getFolder(db, ctx.userId, ctx.param("id"));
  if (!folder) throw new ApiError(404, "not_found", "Folder not found");
  return folder;
});

export const PATCH = defineRoute(RIL_WRITE_SCOPE, async (ctx) => {
  const patch = await parseBody(ctx, folderUpdateApiSchema);
  const updated = await updateFolder(db, ctx.userId, ctx.param("id"), patch);
  if (!updated) throw new ApiError(404, "not_found", "Folder not found");
  return updated;
});

export const DELETE = defineRoute(RIL_WRITE_SCOPE, async (ctx) => {
  const success = await deleteFolder(db, ctx.userId, ctx.param("id"));
  if (!success) throw new ApiError(404, "not_found", "Folder not found");
  return noContent();
});
