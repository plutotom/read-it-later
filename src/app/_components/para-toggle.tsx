"use client";

import Link from "next/link";
import { Check, Loader2, Tablet } from "lucide-react";
import { api } from "~/trpc/react";
import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";
import { ToastAction } from "~/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { toast } from "~/hooks/use-toast";
import { cn } from "~/lib/utils";

interface ParaToggleProps {
  articleId: string;
  articleTitle?: string;
  /** When provided, skips per-article status fetch (use list batch data). */
  isOnPara?: boolean;
  className?: string;
  variant?: "row" | "menu";
  disabled?: boolean;
  disabledReason?: string;
}

function showAddedToast(articleTitle?: string) {
  toast({
    title: "Added to Para",
    description: articleTitle
      ? `"${articleTitle}" is on your e-reader sync list.`
      : "This article is on your e-reader sync list.",
    action: (
      <ToastAction altText="View Para list" asChild>
        <Link href="/para">View list</Link>
      </ToastAction>
    ),
  });
}

function showRemovedToast(articleTitle?: string) {
  toast({
    title: "Removed from Para",
    description: articleTitle
      ? `"${articleTitle}" will be deleted from your device on the next sync.`
      : "Your device will delete this article on the next sync.",
  });
}

export function ParaToggle({
  articleId,
  articleTitle,
  isOnPara: isOnParaProp,
  className,
  variant = "row",
  disabled = false,
  disabledReason,
}: ParaToggleProps) {
  const utils = api.useUtils();

  const { data: queriedIsOnPara = false, isLoading } = api.para.isOnPara.useQuery(
    { articleId },
    { enabled: isOnParaProp === undefined },
  );

  const isOnPara = isOnParaProp ?? queriedIsOnPara;

  const add = api.para.add.useMutation({
    onSuccess: () => {
      void utils.para.isOnPara.invalidate({ articleId });
      void utils.para.getArticleStatuses.invalidate();
      void utils.para.list.invalidate();
      void utils.para.getTotalBytes.invalidate();
      showAddedToast(articleTitle);
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Could not add to Para",
        description: "Something went wrong. Please try again.",
      });
    },
  });

  const remove = api.para.remove.useMutation({
    onSuccess: () => {
      void utils.para.isOnPara.invalidate({ articleId });
      void utils.para.getArticleStatuses.invalidate();
      void utils.para.list.invalidate();
      void utils.para.getTotalBytes.invalidate();
      showRemovedToast(articleTitle);
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Could not remove from Para",
        description: "Something went wrong. Please try again.",
      });
    },
  });

  const isPending = add.isPending || remove.isPending;
  const showOnListState = isOnPara && !isPending;

  const handleChange = (checked: boolean) => {
    if (disabled) return;
    if (checked) {
      add.mutate({ articleId });
    } else {
      remove.mutate({ articleId });
    }
  };

  const disabledTooltip =
    disabledReason ?? "This item can't be synced to Para.";

  if (variant === "menu") {
    const menuButton = (
      <button
        type="button"
        className={cn(
          "relative flex w-full select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none",
          disabled
            ? "cursor-not-allowed text-muted-foreground opacity-60"
            : "cursor-pointer hover:bg-accent hover:text-accent-foreground",
          className,
        )}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled && !isPending) handleChange(!isOnPara);
        }}
        disabled={disabled || (isOnParaProp === undefined && isLoading) || isPending}
      >
        {showOnListState ? (
          <Check className="mr-2 h-4 w-4 text-emerald-400" />
        ) : (
          <Tablet className="mr-2 h-4 w-4" />
        )}
        {isOnPara ? "Remove from Para" : "Add to Para"}
        {((isOnParaProp === undefined && isLoading) || isPending) && (
          <Loader2 className="ml-auto h-4 w-4 animate-spin" />
        )}
      </button>
    );

    if (!disabled) return menuButton;

    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>{menuButton}</TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs">
            {disabledTooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const rowContent = (
    <div
      className={cn(
        "flex items-center justify-between gap-3",
        disabled && "opacity-60",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {showOnListState ? (
          <Check className="h-4 w-4 shrink-0 text-emerald-400" />
        ) : (
          <Tablet className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <Label
            htmlFor={`para-${articleId}`}
            className={cn("text-sm", disabled ? "text-muted-foreground" : "text-white")}
          >
            {showOnListState ? "On Para list" : "Add to Para"}
          </Label>
          {disabled ? (
            <p className="truncate text-xs text-muted-foreground">
              Not available for PDFs
            </p>
          ) : (
            showOnListState && (
              <p className="truncate text-xs text-emerald-400/90">
                Syncs to your e-reader
              </p>
            )
          )}
        </div>
      </div>
      {isOnParaProp === undefined && isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <Switch
          id={`para-${articleId}`}
          checked={isOnPara}
          onCheckedChange={handleChange}
          disabled={disabled || isPending}
        />
      )}
    </div>
  );

  if (!disabled) return rowContent;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-full">{rowContent}</div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {disabledTooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
