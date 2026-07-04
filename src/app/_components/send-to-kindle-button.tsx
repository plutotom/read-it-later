"use client";

import Link from "next/link";
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
    <button
      type="button"
      className={cn(
        "text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs transition-colors",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
      onClick={handleClick}
      disabled={disabled || isPending}
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : isSent ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <BookOpen className="h-3.5 w-3.5" />
      )}
      {label}
      {!isConfigured ? (
        <Link href="/kindle" className="sr-only">
          Set up Kindle
        </Link>
      ) : null}
    </button>
  );
}
