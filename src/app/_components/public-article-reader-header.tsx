/**
 * Header for publicly shared article views
 */

"use client";

import { type Article } from "~/types/article";
import { Button } from "~/components/ui/button";
import { ExternalLink } from "lucide-react";

interface PublicArticleReaderHeaderProps {
  article: Article;
}

export function PublicArticleReaderHeader({
  article,
}: PublicArticleReaderHeaderProps) {
  const domain = (() => {
    try {
      return new URL(article.url).hostname.replace("www.", "");
    } catch {
      return article.url;
    }
  })();

  const readingTime = article.readingTime
    ? `${article.readingTime} min`
    : "Shared";

  return (
    <div className="bg-background/90 sticky top-0 z-20 border-b border-rule backdrop-blur-xl">
      <div className="flex items-center justify-between px-4 py-3 sm:px-8">
        <span className="text-sm text-muted-foreground">Read It Later</span>

        <div className="min-w-0 px-3 text-center text-xs text-muted-foreground">
          <div className="flex items-center justify-center gap-2 truncate">
            <span
              className="inline-flex h-4 w-4 items-center justify-center rounded-[4px] bg-accent text-[9px] font-bold text-accent-foreground"
              aria-hidden
            >
              {domain.charAt(0).toUpperCase()}
            </span>
            <span className="truncate">{domain}</span>
            <span>·</span>
            <span>{readingTime}</span>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          asChild
          className="rounded-full px-2.5 text-sm text-foreground-soft hover:bg-foreground/10 hover:text-foreground"
        >
          <a href={article.url} target="_blank" rel="noopener noreferrer">
            Original
            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </a>
        </Button>
      </div>
    </div>
  );
}
