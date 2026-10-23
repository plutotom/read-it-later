"use client";

import { type Article } from "~/types/article";
import { useContext, useState, type PointerEvent } from "react";
import { GeneralContext } from "../(protected)/contexts/general-context";
import { Button } from "~/components/ui/button";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  MoreVertical,
  ExternalLink,
  Pencil,
  Archive,
  Share2,
  Trash2,
  BookOpen,
  Globe,
} from "lucide-react";
import { type ArticleViewMode } from "~/lib/article-web-view";
import { ParaToggle } from "./para-toggle";
import { ShareDialog } from "./share-dialog";
import { cn } from "~/lib/utils";
import {
  hasExtractedText,
  isPdfArticle,
  DOCUMENT_UNSUPPORTED_PARA_MESSAGE,
} from "~/lib/article-content-kind";

interface ArticleActionsMenuProps {
  article: Article;
  isOnPara?: boolean;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete?: () => void;
  /** Always visible (e.g. hero card) vs show on group-hover */
  alwaysVisible?: boolean;
  /** Include Share in the menu (reader header) */
  showShare?: boolean;
  align?: "start" | "center" | "end";
  className?: string;
  viewMode?: ArticleViewMode;
  onViewModeChange?: (mode: ArticleViewMode) => void;
}

export function ArticleActionsMenu({
  article,
  isOnPara,
  onArchive,
  onUnarchive,
  onDelete,
  alwaysVisible = false,
  showShare = false,
  align = "end",
  className,
  viewMode = "reader",
  onViewModeChange,
}: ArticleActionsMenuProps) {
  const { setMetadataEditArticle } = useContext(GeneralContext);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  // Radix closes the menu on pointer-up; without this, the click can fall through
  // to the article row underneath and navigate/open the article.
  const preventMenuClickThrough = (event: PointerEvent) => {
    event.preventDefault();
  };

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "text-muted-foreground hover:bg-foreground/10 hover:text-foreground h-10 w-10 rounded-full sm:h-8 sm:w-8",
              !alwaysVisible &&
                "opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100",
              className,
            )}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Article actions"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-48">
          {onViewModeChange && (
            <DropdownMenuItem
              onPointerDown={preventMenuClickThrough}
              onClick={(event) => {
                event.stopPropagation();
                onViewModeChange(viewMode === "web" ? "reader" : "web");
              }}
            >
              {viewMode === "web" ? (
                <BookOpen className="mr-2 h-4 w-4" aria-hidden />
              ) : (
                <Globe className="mr-2 h-4 w-4" aria-hidden />
              )}
              {viewMode === "web"
                ? "Switch to Reader view"
                : "Switch to Web view"}
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onPointerDown={preventMenuClickThrough}
            onClick={(e) => {
              e.stopPropagation();
              window.open(article.url, "_blank");
            }}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Open Original
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onPointerDown={preventMenuClickThrough}
            onClick={(e) => {
              e.stopPropagation();
              setMetadataEditArticle({
                id: article.id,
                title: article.title,
                url: article.url,
              });
            }}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Edit metadata
          </DropdownMenuItem>

          <ParaToggle
            articleId={article.id}
            articleTitle={article.title}
            isOnPara={isOnPara}
            variant="menu"
            disabled={isPdfArticle(article) && !hasExtractedText(article)}
            disabledReason={DOCUMENT_UNSUPPORTED_PARA_MESSAGE}
          />

          {article.isArchived ? (
            <DropdownMenuItem
              onPointerDown={preventMenuClickThrough}
              onClick={(e) => {
                e.stopPropagation();
                onUnarchive?.();
              }}
            >
              <Archive className="mr-2 h-4 w-4" />
              Unarchive
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onPointerDown={preventMenuClickThrough}
              onClick={(e) => {
                e.stopPropagation();
                onArchive?.();
              }}
            >
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </DropdownMenuItem>
          )}

          {showShare && (
            <DropdownMenuItem
              onPointerDown={preventMenuClickThrough}
              onSelect={(event) => {
                event.preventDefault();
                setMenuOpen(false);
                setShareDialogOpen(true);
              }}
            >
              <Share2 className="mr-2 h-4 w-4" />
              Share
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onPointerDown={preventMenuClickThrough}
            onSelect={(event) => {
              event.preventDefault();
              setMenuOpen(false);
              setDeleteConfirmOpen(true);
            }}
            className="text-red-400 focus:bg-red-900/30 focus:text-red-400"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showShare && (
        <ShareDialog
          articleId={article.id}
          articleTitle={article.title}
          originalUrl={article.url}
          existingShareToken={article.shareToken}
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
        />
      )}

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete article?"
        description="This article will be permanently removed. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => onDelete?.()}
      />
    </>
  );
}
