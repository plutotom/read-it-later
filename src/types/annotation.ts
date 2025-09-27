/**
 * Annotation type definitions for highlights and notes
 * Represents user annotations on articles
 */

export interface Highlight {
  id: string;
  articleId: string;
  text: string;
  startOffset: number;
  endOffset: number;
  color: HighlightColor;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Note {
  id: string;
  articleId: string;
  highlightId: string | null; // If note is attached to a highlight
  content: string;
  position: NotePosition | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotePosition {
  x: number;
  y: number;
  page?: number;
}

export type HighlightColor =
  | "yellow"
  | "green"
  | "blue"
  | "pink"
  | "purple"
  | "orange"
  | "red"
  | "gray";

export interface HighlightCreateInput {
  articleId: string;
  text: string;
  startOffset: number;
  endOffset: number;
  color: HighlightColor;
  note?: string;
}

export interface HighlightUpdateInput {
  text?: string;
  startOffset?: number;
  endOffset?: number;
  color?: HighlightColor;
  note?: string;
}

export interface NoteCreateInput {
  articleId: string;
  highlightId?: string;
  content: string;
  position?: NotePosition;
}

export interface NoteUpdateInput {
  content?: string;
  position?: NotePosition;
}

export interface AnnotationResponse {
  highlights: Highlight[];
  notes: Note[];
}

export interface ArticleWithAnnotations {
  article: Article;
  highlights: Highlight[];
  notes: Note[];
}

// Re-export Article type for convenience
import type { Article } from "./article";
