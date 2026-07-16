/**
 * Header for publicly shared article views
 */

"use client";

import { type Article } from "~/types/article";
import { Button } from "~/components/ui/button";
import { ExternalLink, List } from "lucide-react";

interface PublicArticleReaderHeaderProps {
  article: Article;
  hasToc?: boolean;
  isTocOpen?: boolean;
  onOpenToc?: () => void;
}

export function PublicArticleReaderHeader({
  article,
  hasToc = false,
  isTocOpen = false,
  onOpenToc,
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
    <div className="bg-background/90 border-rule sticky top-0 z-20 border-b backdrop-blur-xl">
      <div className="flex items-center justify-between px-4 py-3 sm:px-8">
        <span className="text-muted-foreground text-sm">Read It Later</span>

        <div className="text-muted-foreground min-w-0 px-3 text-center text-xs">
          <div className="flex items-center justify-center gap-2 truncate">
            <span
              className="bg-accent text-accent-foreground inline-flex h-4 w-4 items-center justify-center rounded-[4px] text-[9px] font-bold"
              aria-hidden
            >
              {domain.charAt(0).toUpperCase()}
            </span>
            <span className="truncate">{domain}</span>
            <span>·</span>
            <span>{readingTime}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {hasToc && !isTocOpen && onOpenToc && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenToc}
              className="text-foreground-soft hover:bg-foreground/10 hover:text-foreground hidden h-8 w-8 rounded-full lg:inline-flex"
              aria-label="Show table of contents"
            >
              <List className="h-4 w-4" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            asChild
            className="text-foreground-soft hover:bg-foreground/10 hover:text-foreground rounded-full px-2.5 text-sm"
          >
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              Original
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
