/**
 * Article Reader Header Component
 * Matter-inspired header with compact reading controls
 */

"use client";

import { useState } from "react";
import { type Article } from "~/types/article";
import { type Highlight } from "~/types/annotation";
import { ReadingSettings } from "./reading-settings";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Settings,
  ArrowLeft,
  Archive,
  MoreVertical,
  Share2,
  Trash2,
} from "lucide-react";
import { api } from "~/trpc/react";
import { useRouter } from "next/navigation";
import { withViewTransition } from "~/lib/with-view-transition";
import { HighlightsMenu } from "./highlights-menu";
import { ShareDialog } from "./share-dialog";
import { cn } from "~/lib/utils";

interface ArticleReaderHeaderProps {
  article: Article;
  showSettings: boolean;
  onToggleSettings: () => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  autoHighlight: boolean;
  onAutoHighlightChange: (enabled: boolean) => void;
  highlights?: Highlight[];
  onHighlightDelete?: (highlightId: string) => void;
  onHighlightNoteUpdate?: (highlightId: string, note: string | null) => void;
}

export function ArticleReaderHeader({
  article,
  showSettings,
  onToggleSettings,
  fontSize,
  onFontSizeChange,
  autoHighlight,
  onAutoHighlightChange,
  highlights = [],
  onHighlightDelete,
  onHighlightNoteUpdate,
}: ArticleReaderHeaderProps) {
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const utils = api.useUtils();
  const router = useRouter();
  const { mutate: archive } = api.article.archive.useMutation({
    onSuccess: () => {
      void utils.article.get.invalidate({ id: article.id });
      void utils.article.getAll.invalidate();
      void utils.article.getArchived.invalidate();
    },
  });
  const { mutate: unarchive } = api.article.unarchive.useMutation({
    onSuccess: () => {
      void utils.article.get.invalidate({ id: article.id });
      void utils.article.getAll.invalidate();
      void utils.article.getArchived.invalidate();
    },
  });
  const { mutate: deleteArticle } = api.article.delete.useMutation({
    onSuccess: () => {
      void utils.article.getAll.invalidate();
      void utils.article.getArchived.invalidate();
      withViewTransition(() => {
        router.push("/");
      });
    },
  });

  // Smart back navigation: use history if available, otherwise go to inbox
  const handleBackClick = () => {
    const hasHistory =
      typeof window !== "undefined" && window.history.length > 2;
    const referrer = typeof document !== "undefined" ? document.referrer : "";
    const isFromSameOrigin =
      referrer &&
      typeof window !== "undefined" &&
      referrer.startsWith(window.location.origin);

    withViewTransition(() => {
      if (hasHistory && isFromSameOrigin) {
        router.back();
      } else {
        router.push("/");
      }
    });
  };

  const handleArchive = () => {
    archive({ id: article.id });
  };

  const handleUnarchive = () => {
    unarchive({ id: article.id });
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this article?")) {
      deleteArticle({ id: article.id });
    }
  };

  const domain = (() => {
    try {
      return new URL(article.url).hostname.replace("www.", "");
    } catch {
      return article.url;
    }
  })();

  const readingTime = article.readingTime ? `${article.readingTime} min` : "Saved";

  return (
    <div className="bg-background/90 sticky top-0 z-20 border-b border-rule backdrop-blur-xl">
      <div className="flex items-center justify-between px-4 py-3 sm:px-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBackClick}
          className="rounded-full px-2.5 text-sm text-foreground-soft hover:bg-foreground/10 hover:text-foreground"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Close
        </Button>

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

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSettings}
            className={cn(
              "h-8 w-8 rounded-full",
              showSettings
                ? "bg-background-deep text-foreground"
                : "text-foreground-soft hover:bg-foreground/10 hover:text-foreground",
            )}
            aria-label="Reading settings"
          >
            <Settings className="h-4 w-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full text-foreground-soft hover:bg-foreground/10 hover:text-foreground"
                aria-label="Article actions"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {article.isArchived ? (
                <DropdownMenuItem onClick={handleUnarchive}>
                  <Archive className="mr-2 h-4 w-4" />
                  Unarchive
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={handleArchive}>
                  <Archive className="mr-2 h-4 w-4" />
                  Archive
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setShareDialogOpen(true)}>
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-red-400 focus:bg-red-900/30 focus:text-red-400"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {showSettings && (
        <div className="border-t border-rule px-4 py-3 sm:px-8">
          <div className="flex flex-col gap-3 rounded-2xl border border-rule bg-surface p-3 shadow-[var(--shadow-soft)]">
            <ReadingSettings
              fontSize={fontSize}
              onFontSizeChange={onFontSizeChange}
              autoHighlight={autoHighlight}
              onAutoHighlightChange={onAutoHighlightChange}
            />

            <div className="border-t border-rule pt-3">
              <HighlightsMenu
                highlights={highlights}
                onHighlightDelete={onHighlightDelete}
                onHighlightNoteUpdate={onHighlightNoteUpdate}
              />
            </div>
          </div>
        </div>
      )}

      <ShareDialog
        articleId={article.id}
        articleTitle={article.title}
        originalUrl={article.url}
        existingShareToken={article.shareToken}
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
      />
    </div>
  );
}
