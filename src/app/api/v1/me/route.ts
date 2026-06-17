import { RIL_READ_SCOPE } from "~/lib/paraConstants";
import { defineRoute } from "~/server/lib/apiHandler";

export const GET = defineRoute(RIL_READ_SCOPE, (ctx) => {
  return Promise.resolve({
    userId: ctx.userId,
    apiKeyId: ctx.apiKeyId,
    scopes: ctx.scopes,
  });
});
