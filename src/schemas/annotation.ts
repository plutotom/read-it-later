/**
 * Zod validation schemas for Annotation types (highlights and notes)
 * Provides runtime validation for annotation-related data
 */

import { z } from "zod";

// Highlight color enum
export const highlightColorSchema = z.enum([
  "yellow",
  "green",
  "blue",
  "pink",
  "purple",
  "orange",
  "red",
  "gray",
]);

// Note position schema
export const notePositionSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  page: z.number().int().min(1).optional(),
});

// Base highlight schema
export const highlightSchema = z
  .object({
    id: z.string().uuid(),
    articleId: z.string().uuid(),
    text: z.string().min(1).max(10000),
    startOffset: z.number().int().min(0),
    endOffset: z.number().int().min(0),
    color: highlightColorSchema,
    note: z.string().max(2000).optional().nullable(),
    contextPrefix: z.string().max(100).optional().nullable(),
    contextSuffix: z.string().max(100).optional().nullable(),
    tags: z.array(z.string().max(50)).max(10).optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .refine((data) => data.endOffset > data.startOffset, {
    message: "End offset must be greater than start offset",
    path: ["endOffset"],
  });

// Highlight creation schema
export const highlightCreateSchema = z
  .object({
    articleId: z.string().uuid("Invalid article ID"),
    text: z
      .string()
      .min(1, "Highlight text is required")
      .max(10000, "Highlight text too long"),
    startOffset: z.number().int().min(0, "Start offset must be non-negative"),
    endOffset: z.number().int().min(0, "End offset must be non-negative"),
    color: highlightColorSchema.default("yellow"),
    note: z.string().max(2000).optional(),
    contextPrefix: z.string().max(100).optional(),
    contextSuffix: z.string().max(100).optional(),
    tags: z.array(z.string().max(50)).max(10).optional(),
  })
  .refine((data) => data.endOffset > data.startOffset, {
    message: "End offset must be greater than start offset",
    path: ["endOffset"],
  });

// Highlight update schema
export const highlightUpdateSchema = z
  .object({
    text: z.string().min(1).max(10000).optional(),
    startOffset: z.number().int().min(0).optional(),
    endOffset: z.number().int().min(0).optional(),
    color: highlightColorSchema.optional(),
    note: z.string().max(2000).optional().nullable(),
    tags: z.array(z.string().max(50)).max(10).optional(),
  })
  .refine(
    (data) => {
      if (data.startOffset !== undefined && data.endOffset !== undefined) {
        return data.endOffset > data.startOffset;
      }
      return true;
    },
    {
      message: "End offset must be greater than start offset",
      path: ["endOffset"],
    },
  );

// Base note schema
export const noteSchema = z.object({
  id: z.string().uuid(),
  articleId: z.string().uuid(),
  highlightId: z.string().uuid().optional(),
  content: z.string().min(1).max(10000),
  position: notePositionSchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Note creation schema
export const noteCreateSchema = z.object({
  articleId: z.string().uuid("Invalid article ID"),
  highlightId: z.string().uuid().optional(),
  content: z
    .string()
    .min(1, "Note content is required")
    .max(10000, "Note content too long"),
  position: notePositionSchema.optional(),
});

// Note update schema
export const noteUpdateSchema = z.object({
  content: z.string().min(1).max(10000).optional(),
  position: notePositionSchema.optional(),
});

// Annotation response schema
export const annotationResponseSchema = z.object({
  highlights: z.array(highlightSchema),
  notes: z.array(noteSchema),
});

// Article with annotations schema
export const articleWithAnnotationsSchema = z.object({
  article: z.any(), // Will be validated with article schema
  highlights: z.array(highlightSchema),
  notes: z.array(noteSchema),
});

// Batch operations schemas
export const batchHighlightCreateSchema = z.object({
  articleId: z.string().uuid(),
  highlights: z.array(
    z
      .object({
        text: z
          .string()
          .min(1, "Highlight text is required")
          .max(10000, "Highlight text too long"),
        startOffset: z
          .number()
          .int()
          .min(0, "Start offset must be non-negative"),
        endOffset: z.number().int().min(0, "End offset must be non-negative"),
        color: highlightColorSchema.default("yellow"),
        note: z.string().max(2000).optional(),
      })
      .refine((data) => data.endOffset > data.startOffset, {
        message: "End offset must be greater than start offset",
        path: ["endOffset"],
      }),
  ),
});

export const batchNoteCreateSchema = z.object({
  articleId: z.string().uuid(),
  notes: z.array(
    z.object({
      highlightId: z.string().uuid().optional(),
      content: z
        .string()
        .min(1, "Note content is required")
        .max(10000, "Note content too long"),
      position: notePositionSchema.optional(),
    }),
  ),
});

// Type exports for use in other files
export type HighlightInput = z.infer<typeof highlightSchema>;
export type HighlightCreateInput = z.infer<typeof highlightCreateSchema>;
export type HighlightUpdateInput = z.infer<typeof highlightUpdateSchema>;
export type NoteInput = z.infer<typeof noteSchema>;
export type NoteCreateInput = z.infer<typeof noteCreateSchema>;
export type NoteUpdateInput = z.infer<typeof noteUpdateSchema>;
export type NotePosition = z.infer<typeof notePositionSchema>;
export type HighlightColor = z.infer<typeof highlightColorSchema>;
export type AnnotationResponse = z.infer<typeof annotationResponseSchema>;
export type ArticleWithAnnotations = z.infer<
  typeof articleWithAnnotationsSchema
>;
export type BatchHighlightCreateInput = z.infer<
  typeof batchHighlightCreateSchema
>;
export type BatchNoteCreateInput = z.infer<typeof batchNoteCreateSchema>;
