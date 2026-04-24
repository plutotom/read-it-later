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
  if (minutes < 1) return "< 1 min";
  return `${minutes} min`;
}

function getDomainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

export function ArticleMetadata({ article }: ArticleMetadataProps) {
  const domain = getDomainFromUrl(article.url);

  return (
    <div className="mb-10">
      <h1
        className="text-[2.6rem] leading-[1.05] font-medium tracking-tight text-foreground sm:text-[3.4rem]"
        style={{ fontFamily: "var(--font-app-display)" }}
      >
        {article.title}
      </h1>

      <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {article.author && <span>{article.author}</span>}
        {article.author && <span>·</span>}
        <span>{domain}</span>
        {article.readingTime && (
          <>
            <span>·</span>
            <span>{formatReadingTime(article.readingTime)}</span>
          </>
        )}
        {article.publishedAt && (
          <>
            <span>·</span>
            <span>{formatDate(article.publishedAt)}</span>
          </>
        )}
      </div>
    </div>
  );
}
