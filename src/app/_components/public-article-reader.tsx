/**
 * Public Article Reader Component
 * Simplified reader for publicly shared articles (no highlights, no auth)
 */

"use client";

import { type Article } from "~/types/article";
import { PublicAudioPlayer } from "./public-audio-player";

interface PublicArticleReaderProps {
  article: Article;
  shareToken: string;
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

export function PublicArticleReader({ article, shareToken }: PublicArticleReaderProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Simple header */}
      <header className="sticky top-0 z-10 border-b border-gray-700 bg-background px-4 py-3">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">
              Shared from Read It Later
            </span>
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              View Original →
            </a>
          </div>
        </div>
      </header>

      {/* Article content */}
      <main className="flex-1 overflow-y-auto">
        <article className="mx-auto max-w-3xl px-4 py-6">
          {/* Metadata */}
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

          {/* Audio Player (if available) */}
          <div className="mb-6">
            <PublicAudioPlayer shareToken={shareToken} articleId={article.id} />
          </div>

          {/* Article content */}
          <div
            className="article-content max-w-none leading-relaxed text-gray-200"
            style={{ fontSize: "16px", lineHeight: 1.6 }}
          >
            <div dangerouslySetInnerHTML={{ __html: article.content }} />
          </div>
        </article>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-700 bg-background px-4 py-4">
        <div className="mx-auto max-w-3xl text-center text-sm text-gray-500">
          <p>
            This article was shared via{" "}
            <span className="text-gray-400">Read It Later</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
