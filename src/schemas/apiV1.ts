/**
 * Zod request schemas for the public REST API (`/api/v1`).
 *
 * These mirror the tRPC input schemas but accept JSON-friendly values (e.g.
 * `publishedAt` as an ISO string coerced to a Date).
 */
import { z } from "zod";
import { HIGHLIGHT_COLORS } from "~/server/services/annotationService";

const tagsSchema = z.array(z.string().max(50)).max(20);

// ---- Articles ------------------------------------------------------------

/**
 * Create an article. Provide `url` to extract from a web page, or
 * `title` + `content` to create from supplied text.
 */
export const articleCreateApiSchema = z
  .object({
    url: z.string().url().optional(),
    title: z.string().min(1).max(500).optional(),
    content: z.string().min(1).optional(),
    author: z.string().max(200).optional(),
    publishedAt: z.coerce.date().optional(),
    folderId: z.string().uuid().optional(),
    tags: tagsSchema.optional(),
  })
  .refine((d) => (d.content ? !!d.title : !!d.url), {
    message:
      "Provide `url` to import a page, or `title` and `content` to create from text",
  });

export type ArticleCreateApiInput = z.infer<typeof articleCreateApiSchema>;

export const articleUpdateApiSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    url: z.string().url().optional(),
    folderId: z.string().uuid().nullable().optional(),
    tags: tagsSchema.nullable().optional(),
    isFavorite: z.boolean().optional(),
    isRead: z.boolean().optional(),
    isArchived: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided",
  });

export type ArticleUpdateApiInput = z.infer<typeof articleUpdateApiSchema>;

// ---- Folders -------------------------------------------------------------

export const folderCreateApiSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "color must be a #RRGGBB hex string")
    .optional(),
  icon: z.string().max(50).optional(),
  parentId: z.string().uuid().optional(),
});

export type FolderCreateApiInput = z.infer<typeof folderCreateApiSchema>;

export const folderUpdateApiSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(1000).nullable().optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "color must be a #RRGGBB hex string")
      .nullable()
      .optional(),
    icon: z.string().max(50).nullable().optional(),
    parentId: z.string().uuid().nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided",
  });

export type FolderUpdateApiInput = z.infer<typeof folderUpdateApiSchema>;

// ---- Highlights ----------------------------------------------------------

const highlightColorSchema = z.enum(HIGHLIGHT_COLORS);

export const highlightCreateApiSchema = z.object({
  text: z.string().min(1),
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().min(0),
  color: highlightColorSchema.optional(),
  contextPrefix: z.string().max(100),
  contextSuffix: z.string().max(100),
  version: z.number().int().optional(),
  anchorContentHash: z.string().optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

export type HighlightCreateApiInput = z.infer<typeof highlightCreateApiSchema>;

export const highlightUpdateApiSchema = z
  .object({
    color: highlightColorSchema.optional(),
    tags: z.array(z.string().max(50)).max(10).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided",
  });

export type HighlightUpdateApiInput = z.infer<typeof highlightUpdateApiSchema>;

// ---- Notes ---------------------------------------------------------------

export const noteCreateApiSchema = z.object({
  content: z.string().min(1),
  highlightId: z.string().uuid().optional(),
});

export type NoteCreateApiInput = z.infer<typeof noteCreateApiSchema>;

export const noteUpdateApiSchema = z
  .object({
    content: z.string().min(1).optional(),
    highlightId: z.string().uuid().nullable().optional(),
    position: z
      .object({
        x: z.number().min(0),
        y: z.number().min(0),
        page: z.number().int().min(1).optional(),
      })
      .optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided",
  });

export type NoteUpdateApiInput = z.infer<typeof noteUpdateApiSchema>;

// ---- Para exports --------------------------------------------------------

export const paraExportCreateApiSchema = z.object({
  articleId: z.string().uuid(),
});

export type ParaExportCreateApiInput = z.infer<typeof paraExportCreateApiSchema>;

// ---- Kindle delivery -----------------------------------------------------

export const kindleDeliveryCreateApiSchema = z.object({
  articleId: z.string().uuid(),
  force: z.boolean().optional(),
});

export const kindleDeliverySendApiSchema = z.object({
  force: z.boolean().optional(),
});

export type KindleDeliveryCreateApiInput = z.infer<
  typeof kindleDeliveryCreateApiSchema
>;
