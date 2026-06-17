import { RIL_READ_SCOPE } from "~/lib/paraConstants";
import { db } from "~/server/db";
import { defineRoute } from "~/server/lib/apiHandler";
import { listTags } from "~/server/services/articleService";

export const GET = defineRoute(RIL_READ_SCOPE, async (ctx) => {
  const data = await listTags(db, ctx.userId);
  return { data };
});
