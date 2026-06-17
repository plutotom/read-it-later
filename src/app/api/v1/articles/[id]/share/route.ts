import { RIL_WRITE_SCOPE } from "~/lib/paraConstants";
import { db } from "~/server/db";
import { ApiError, defineRoute } from "~/server/lib/apiHandler";
import { generateShareLink } from "~/server/services/articleService";
import { getRequestBaseUrl } from "~/server/lib/apiAuth";

export const POST = defineRoute(RIL_WRITE_SCOPE, async (ctx) => {
  let shareToken: string;
  try {
    shareToken = await generateShareLink(db, ctx.userId, ctx.param("id"));
  } catch {
    throw new ApiError(404, "not_found", "Article not found");
  }

  const baseUrl = getRequestBaseUrl(ctx.request);
  return {
    shareToken,
    shareUrl: `${baseUrl.replace(/\/$/, "")}/shared/${shareToken}`,
  };
});
