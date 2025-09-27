import { postRouter } from "~/server/api/routers/post";
import { articleRouter } from "~/server/api/routers/article";
import { folderRouter } from "~/server/api/routers/folder";
import { annotationRouter } from "~/server/api/routers/annotation";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
  article: articleRouter,
  folder: folderRouter,
  annotation: annotationRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
