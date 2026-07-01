"use client";

import { type Article } from "~/types/article";
import { useContext, useState } from "react";
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
  Trash2,
} from "lucide-react";
import { ParaToggle } from "./para-toggle";
import { cn } from "~/lib/utils";
import {
  isPdfArticle,
  PDF_UNSUPPORTED_PARA_MESSAGE,
} from "~/lib/article-content-kind";

interface ArticleActionsMenuProps {
  article: Article;
  isOnPara?: boolean;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete?: () => void;
  /** Always visible (e.g. hero card) vs show on group-hover */
  alwaysVisible?: boolean;
  align?: "start" | "center" | "end";
  className?: string;
}

export function ArticleActionsMenu({
  article,
  isOnPara,
  onArchive,
  onUnarchive,
  onDelete,
  alwaysVisible = false,
  align = "end",
  className,
}: ArticleActionsMenuProps) {
  const { setMetadataEditArticle } = useContext(GeneralContext);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "text-muted-foreground hover:bg-foreground/10 hover:text-foreground h-8 w-8 rounded-full",
              !alwaysVisible &&
                "opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100",
              className,
            )}
            onClick={(e) => e.stopPropagation()}
            aria-label="Article actions"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-48">
          <DropdownMenuItem
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
            disabled={isPdfArticle(article)}
            disabledReason={PDF_UNSUPPORTED_PARA_MESSAGE}
          />

          {article.isArchived ? (
            <DropdownMenuItem
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
              onClick={(e) => {
                e.stopPropagation();
                onArchive?.();
              }}
            >
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onSelect={() => setDeleteConfirmOpen(true)}
            className="text-red-400 focus:bg-red-900/30 focus:text-red-400"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
