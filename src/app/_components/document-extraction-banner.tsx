"use client";

import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import type { Article, ArticleMetadata } from "~/types/article";
import { api } from "~/trpc/react";
import { documentNeedsExtractionWarning } from "~/lib/article-content-kind";

interface DocumentExtractionBannerProps {
  article: Article;
  showRetry?: boolean;
}

export function DocumentExtractionBanner({
  article,
  showRetry = true,
}: DocumentExtractionBannerProps) {
  const utils = api.useUtils();
  const metadata = article.metadata as ArticleMetadata | null | undefined;
  const status = metadata?.extractionStatus;

  const reExtract = api.article.reExtract.useMutation({
    onSuccess: (updated) => {
      void utils.article.get.setData({ id: article.id }, updated);
      void utils.article.get.invalidate({ id: article.id });
    },
  });

  if (!documentNeedsExtractionWarning(article)) {
    return null;
  }

  const message =
    status === "skipped"
      ? "This PDF has no text layer. Search and listen aren't available, but you can still read it below."
      : (metadata?.extractionError ??
        "Text extraction failed. You can still view the PDF below.");

  return (
    <Alert
      variant={status === "failed" ? "destructive" : "default"}
      className="border-rule bg-surface mb-4 rounded-2xl border shadow-[var(--shadow-soft)]"
    >
      <AlertCircle className="h-4 w-4" />
      <AlertDescription className="flex flex-col gap-3 text-sm">
        <p>{message}</p>
        {showRetry && status === "failed" && (
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={reExtract.isPending}
              onClick={() => reExtract.mutate({ articleId: article.id })}
            >
              {reExtract.isPending ? "Retrying…" : "Retry extraction"}
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
