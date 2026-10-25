import { z } from "zod";
import {
  nativeAnnotationMutationSchemas,
  type NativeAnnotationSnapshot,
} from "./native-annotations";

export const NATIVE_LIBRARY_PROTOCOL = 1 as const;
export const NATIVE_LIBRARY_REQUEST_BYTES = 1_048_576;
export const NATIVE_LIBRARY_PAGE_BYTES = 4_194_304;
export const NATIVE_LIBRARY_ARTICLE_BYTES = 1_048_576;
export const NATIVE_LIBRARY_HTML_BYTES = 4_194_304;
export const NATIVE_LIBRARY_TITLE_CHARACTERS = 2048;
// Leave room for worst-case JSON escaping plus the remaining metadata. Unlike
// display titles, identity URLs must never be silently truncated.
export const NATIVE_LIBRARY_URL_BYTES = 16_384;

/** Exact URLs are the deduplication key; query strings are never discarded. */
export function isNativeLibraryPublicURL(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/u, "");
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      !host.includes(".") ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host.endsWith(".test") ||
      host.endsWith(".invalid") ||
      host.includes(":") ||
      /^[\d.]+$/u.test(host)
    )
      return false;
    return true;
  } catch {
    return false;
  }
}

const safeString = (maximum: number) =>
  z
    .string()
    .max(maximum)
    .refine(
      (value) => !/[\u0000\uD800-\uDFFF]/u.test(value),
      "Invalid Unicode or NUL",
    );
const id = z.uuid().transform((value) => value.toLowerCase());
const create = z.strictObject({
  mutationId: id,
  kind: z.literal("create"),
  articleId: id,
  url: safeString(8192)
    .min(1)
    .refine(
      (value) => value === value.trim() && isNativeLibraryPublicURL(value),
    ),
  title: safeString(2048),
  text: safeString(200_000),
  isRead: z.boolean(),
  isFavorite: z.boolean(),
});
const update = z.strictObject({
  mutationId: id,
  kind: z.literal("update"),
  articleId: id,
  patch: z
    .strictObject({
      isRead: z.boolean().optional(),
      isFavorite: z.boolean().optional(),
      isArchived: z.boolean().optional(),
    })
    .refine((patch) => Object.keys(patch).length > 0, "Empty patch"),
});
const remove = z.strictObject({
  mutationId: id,
  kind: z.literal("delete"),
  articleId: id,
});
const nativeLibraryV1MutationsSchema = z.strictObject({
  protocolVersion: z.literal(NATIVE_LIBRARY_PROTOCOL),
  mutations: z
    .array(z.discriminatedUnion("kind", [create, update, remove]))
    .min(1)
    .max(25),
});
export const nativeLibraryMutationsSchema = z.discriminatedUnion(
  "protocolVersion",
  [
    nativeLibraryV1MutationsSchema,
    z.strictObject({
      protocolVersion: z.literal(2),
      mutations: z
        .array(
          z.discriminatedUnion("kind", [
            create,
            update,
            remove,
            ...nativeAnnotationMutationSchemas,
          ]),
        )
        .min(1)
        .max(25),
    }),
  ],
);
export type NativeArticleMutation = z.infer<
  typeof nativeLibraryV1MutationsSchema
>["mutations"][number];
export type NativeLibraryMutation = z.infer<
  typeof nativeLibraryMutationsSchema
>["mutations"][number];
export interface NativeArticle {
  id: string;
  url: string;
  title: string;
  text: string;
  /** Metadata-only change: clients must preserve any previously saved text. */
  contentUnavailable?: boolean;
  contentHash: string;
  format: "paper-drive-text-v1";
  isRead: boolean;
  isFavorite: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface NativeLibraryChange {
  revision: string;
  id: string;
  deleted: boolean;
  article: NativeArticle | null;
  annotations?: NativeAnnotationSnapshot;
}
export interface NativeLibraryMutationResult {
  mutationId: string;
  status: "applied" | "deleted";
  articleId: string;
  annotationId?: string;
  /** Owner counter after this annotation effect; a receipt fence, never a pull cursor. */
  effectRevision?: string;
  /** Deleted annotation ACK only: no physical entity with this ID remains for the owner. */
  permanentDeletion?: boolean;
}
