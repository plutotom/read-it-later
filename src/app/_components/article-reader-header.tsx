/**
 * Article Reader Header Component
 * Matter-inspired header with compact reading controls
 */

"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import { type Article } from "~/types/article";
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
  List,
  MoreVertical,
  Share2,
  Trash2,
} from "lucide-react";
import { api } from "~/trpc/react";
import { useRouter } from "next/navigation";
import {
  getReturnToLabel,
  sanitizeReturnTo,
} from "~/lib/article-navigation";
import { withViewTransition } from "~/lib/with-view-transition";
import { ShareDialog } from "./share-dialog";
import { ParaToggle } from "./para-toggle";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { useDeleteArticle } from "../_hooks/use-delete-article";
import { cn } from "~/lib/utils";
import {
  isPdfArticle,
  PDF_UNSUPPORTED_PARA_MESSAGE,
} from "~/lib/article-content-kind";

interface ArticleReaderHeaderProps {
  article: Article;
  showSettings: boolean;
  onToggleSettings: () => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  hasToc?: boolean;
  isTocOpen?: boolean;
  onOpenToc?: () => void;
  returnTo?: string;
}

export function ArticleReaderHeader({
  article,
  showSettings,
  onToggleSettings,
  fontSize,
  onFontSizeChange,
  hasToc = false,
  isTocOpen = false,
  onOpenToc,
  returnTo: returnToProp,
}: ArticleReaderHeaderProps) {
  const returnTo = sanitizeReturnTo(returnToProp ?? null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
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
  const { mutate: deleteArticle } = useDeleteArticle({
    // Navigate the instant the article is removed from the cache, rather than
    // waiting for the server round-trip to finish.
    onOptimisticDelete: () => {
      withViewTransition(() => {
        router.push(returnTo);
      });
    },
  });

  const handleBackClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;

    e.preventDefault();
    withViewTransition(() => {
      router.push(returnTo);
    });
  };

  const handleArchive = () => {
    archive({ id: article.id });
  };

  const handleUnarchive = () => {
    unarchive({ id: article.id });
  };

  const handleDelete = () => {
    deleteArticle({ id: article.id });
  };

  const domain = (() => {
    try {
      return new URL(article.url).hostname.replace("www.", "");
    } catch {
      return article.url;
    }
  })();

  const readingTime = isPdfArticle(article)
    ? "PDF"
    : article.readingTime
      ? `${article.readingTime} min`
      : "Saved";

  return (
    <div className="bg-background/90 border-rule sticky top-0 z-20 border-b backdrop-blur-xl">
      <div className="flex items-center justify-between px-4 py-3 sm:px-8">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="text-foreground-soft hover:bg-foreground/10 hover:text-foreground rounded-full px-2.5 text-sm"
        >
          <Link
            href={returnTo}
            onClick={handleBackClick}
            aria-label={getReturnToLabel(returnTo)}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
            Close
          </Link>
        </Button>

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
                className="text-foreground-soft hover:bg-foreground/10 hover:text-foreground h-8 w-8 rounded-full"
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
              <ParaToggle
                articleId={article.id}
                articleTitle={article.title}
                variant="menu"
                disabled={isPdfArticle(article)}
                disabledReason={PDF_UNSUPPORTED_PARA_MESSAGE}
              />
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setDeleteConfirmOpen(true)}
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
        <div className="border-rule border-t px-4 py-3 sm:px-8">
          <div className="border-rule bg-surface flex flex-col gap-3 rounded-2xl border p-3 shadow-[var(--shadow-soft)]">
            <ReadingSettings
              fontSize={fontSize}
              onFontSizeChange={onFontSizeChange}
            />

            <div className="border-rule border-t pt-3">
              <ParaToggle
                articleId={article.id}
                articleTitle={article.title}
                className="px-1 py-2"
                disabled={isPdfArticle(article)}
                disabledReason={PDF_UNSUPPORTED_PARA_MESSAGE}
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

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete article?"
        description="This article will be permanently removed. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
