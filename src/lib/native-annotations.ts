import { z } from "zod";

export const NATIVE_ANNOTATION_COLORS = [
  "yellow",
  "green",
  "blue",
  "pink",
  "purple",
  "orange",
  "red",
  "gray",
] as const;
export const NATIVE_ANNOTATION_TEXT_CHARACTERS = 200_000;
const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine(
      (value) => !/[\u0000\uD800-\uDFFF]/u.test(value),
      "Invalid Unicode or NUL",
    );
const uuid = z.uuid().transform((value) => value.toLowerCase());

export const sourceAnchorSchema = z
  .strictObject({
    space: z.enum(["web-dom-v1", "paper-drive-text-v1", "local-text-v1"]),
    text: text(NATIVE_ANNOTATION_TEXT_CHARACTERS).min(1),
    startOffset: z.number().int().min(0).max(2_147_483_647),
    endOffset: z.number().int().min(1).max(2_147_483_647),
    contextPrefix: text(2048),
    contextSuffix: text(2048),
    contentHash: z.string(),
  })
  .superRefine((anchor, ctx) => {
    if (anchor.endOffset - anchor.startOffset !== anchor.text.length)
      ctx.addIssue({
        code: "custom",
        message: "Quote must match UTF-16 range length",
      });
    const hash =
      anchor.space === "web-dom-v1"
        ? // Empty is the explicit unknown-hash sentinel on historical web exports.
          // It never authenticates offsets; recovery still has to be unique.
          /^(?:[a-f0-9]{14})?$/u
        : /^[a-f0-9]{64}$/u;
    if (!hash.test(anchor.contentHash))
      ctx.addIssue({ code: "custom", message: "Invalid source content hash" });
  });
export type SourceAnchor = z.infer<typeof sourceAnchorSchema>;
export interface CanonicalAnchor {
  text: string;
  startOffset: number;
  endOffset: number;
  contentHash: string;
}
export interface NativeNote {
  id: string;
  articleId: string;
  highlightId: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}
export interface NativeHighlight {
  id: string;
  articleId: string;
  color: (typeof NATIVE_ANNOTATION_COLORS)[number];
  sourceAnchor: SourceAnchor;
  canonicalAnchor: CanonicalAnchor | null;
  resolution: "anchored" | "unresolved";
  createdAt: string;
  updatedAt: string;
}
export type NativeAnnotationSnapshot =
  | {
      complete: true;
      notes: NativeNote[];
      highlights: NativeHighlight[];
      deleted: { kind: "note" | "highlight"; id: string }[];
    }
  | { complete: false; reason: "annotation_limit" };

const base = { mutationId: uuid, articleId: uuid };
export const nativeAnnotationMutationSchemas = [
  z.strictObject({
    ...base,
    kind: z.literal("note.create"),
    noteId: uuid,
    content: text(NATIVE_ANNOTATION_TEXT_CHARACTERS),
    highlightId: uuid.nullable().optional(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("note.update"),
    noteId: uuid,
    patch: z.strictObject({ content: text(NATIVE_ANNOTATION_TEXT_CHARACTERS) }),
  }),
  z.strictObject({ ...base, kind: z.literal("note.delete"), noteId: uuid }),
  z.strictObject({
    ...base,
    kind: z.literal("highlight.create"),
    highlightId: uuid,
    color: z.enum(NATIVE_ANNOTATION_COLORS),
    sourceAnchor: sourceAnchorSchema.refine(
      (anchor) => anchor.contentHash.length > 0,
      "New selectors require a source content hash",
    ),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("highlight.update"),
    highlightId: uuid,
    patch: z.strictObject({ color: z.enum(NATIVE_ANNOTATION_COLORS) }),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("highlight.delete"),
    highlightId: uuid,
  }),
] as const;
export const nativeAnnotationMutationSchema = z.discriminatedUnion(
  "kind",
  nativeAnnotationMutationSchemas,
);
export type NativeAnnotationMutation = z.infer<
  typeof nativeAnnotationMutationSchema
>;
