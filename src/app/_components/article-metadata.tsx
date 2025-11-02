/**
 * Article Metadata Component
 * Displays article metadata: domain, date, title, author, tags
 */

"use client";

import { type Article } from "~/types/article";

interface ArticleMetadataProps {
  article: Article;
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatReadingTime(minutes: number) {
  if (minutes < 1) return "< 1 min read";
  return `${minutes} min read`;
}

function getDomainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

export function ArticleMetadata({ article }: ArticleMetadataProps) {
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center text-sm text-gray-400">
        <span>{getDomainFromUrl(article.url)}</span>
        {article.publishedAt && (
          <>
            <span className="mx-2">•</span>
            <span>{formatDate(article.publishedAt)}</span>
          </>
        )}
        {article.readingTime && (
          <>
            <span className="mx-2">•</span>
            <span>{formatReadingTime(article.readingTime)}</span>
          </>
        )}
      </div>

      <h1 className="mb-4 text-2xl leading-tight font-bold text-gray-100">
        {article.title}
      </h1>

      {article.author && (
        <p className="mb-4 text-gray-300">By {article.author}</p>
      )}

      {article.tags && article.tags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {article.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full bg-blue-900/50 px-2 py-1 text-xs font-medium text-blue-300"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
