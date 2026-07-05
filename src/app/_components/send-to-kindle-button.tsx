"use client";

import { useRouter } from "next/navigation";
import { BookOpen, Check, Loader2 } from "lucide-react";
import { api } from "~/trpc/react";
import { toast } from "~/hooks/use-toast";
import { cn } from "~/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

interface SendToKindleButtonProps {
  articleId: string;
  articleTitle?: string;
  variant?: "menu" | "row";
  className?: string;
  disabled?: boolean;
  disabledReason?: string;
  /** When provided, skips per-article status fetch. */
  deliveryStatus?: "sent" | "failed" | "pending" | false;
}

export function SendToKindleButton({
  articleId,
  articleTitle,
  variant = "menu",
  className,
  disabled = false,
  disabledReason,
  deliveryStatus: deliveryStatusProp,
}: SendToKindleButtonProps) {
  const router = useRouter();
  const utils = api.useUtils();

  const { data: setup } = api.kindle.getSetup.useQuery();
  const { data: queriedStatus, isLoading: statusLoading } =
    api.kindle.getArticleStatuses.useQuery(
      { articleIds: [articleId] },
      { enabled: deliveryStatusProp === undefined },
    );

  const deliveryStatus =
    deliveryStatusProp ??
    queriedStatus?.[articleId] ??
    false;

  const send = api.kindle.send.useMutation({
    onSuccess: () => {
      void utils.kindle.getArticleStatuses.invalidate();
      void utils.kindle.listDeliveries.invalidate();
      toast({
        title: "Sent to Kindle",
        description: articleTitle
          ? `"${articleTitle}" should appear on your Kindle shortly.`
          : "Your article should appear on your Kindle shortly.",
      });
    },
    onError: (error) => {
      if (error.data?.code === "PRECONDITION_FAILED") {
        router.push("/kindle");
        return;
      }

      toast({
        variant: "destructive",
        title: "Could not send to Kindle",
        description: error.message,
      });
    },
  });

  const isPending = send.isPending;
  const isSent = deliveryStatus === "sent" && !isPending;
  const isConfigured = setup?.isConnected;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (disabled || isPending) return;

    if (!isConfigured) {
      router.push("/kindle");
      return;
    }

    send.mutate({
      articleId,
      force: isSent,
    });
  };

  const label = !isConfigured
    ? "Set up Send to Kindle"
    : isSent
      ? "Resend to Kindle"
      : "Send to Kindle";

  const disabledTooltip =
    disabledReason ?? "This item can't be sent to Kindle.";

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
        onClick={handleClick}
        disabled={disabled || (deliveryStatusProp === undefined && statusLoading) || isPending}
      >
        {isSent ? (
          <Check className="mr-2 h-4 w-4 text-emerald-400" />
        ) : (
          <BookOpen className="mr-2 h-4 w-4" />
        )}
        {label}
        {((deliveryStatusProp === undefined && statusLoading) || isPending) && (
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

  return (
    <div
      className={cn(
        "flex w-full items-center justify-between gap-3",
        disabled && "opacity-60",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 text-left",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
        onClick={handleClick}
        disabled={disabled || isPending}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : isSent ? (
          <Check className="h-4 w-4 shrink-0 text-emerald-400" />
        ) : (
          <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <p className="text-sm text-foreground">{label}</p>
          {isSent ? (
            <p className="truncate text-xs text-emerald-400/90">
              Delivered to your Kindle
            </p>
          ) : !isConfigured ? (
            <p className="truncate text-xs text-muted-foreground">
              Set up your Kindle email first
            </p>
          ) : null}
        </div>
      </button>
    </div>
  );
}
