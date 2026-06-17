import { RIL_READ_SCOPE, RIL_WRITE_SCOPE } from "~/lib/paraConstants";
import { db } from "~/server/db";
import { created, defineRoute, parseBody } from "~/server/lib/apiHandler";
import { createFolder, listFolders } from "~/server/services/folderService";
import { folderCreateApiSchema } from "~/schemas/apiV1";

export const GET = defineRoute(RIL_READ_SCOPE, async (ctx) => {
  return listFolders(db, ctx.userId);
});

export const POST = defineRoute(RIL_WRITE_SCOPE, async (ctx) => {
  const input = await parseBody(ctx, folderCreateApiSchema);
  const folder = await createFolder(db, ctx.userId, input);
  return created(folder);
});
