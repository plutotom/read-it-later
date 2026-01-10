/**
 * Share Dialog Component
 * Modal for generating and copying public share links
 */

"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Check, Copy, ExternalLink, Link, Loader2 } from "lucide-react";

interface ShareDialogProps {
  articleId: string;
  articleTitle: string;
  originalUrl: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({
  articleId,
  articleTitle,
  originalUrl,
  open,
  onOpenChange,
}: ShareDialogProps) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedOriginal, setCopiedOriginal] = useState(false);

  const generateShareLink = api.article.generateShareLink.useMutation({
    onSuccess: (data) => {
      const url = `${window.location.origin}/shared/${data.shareToken}`;
      setShareUrl(url);
    },
  });

  const handleGenerateLink = () => {
    generateShareLink.mutate({ id: articleId });
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyOriginal = async () => {
    await navigator.clipboard.writeText(originalUrl);
    setCopiedOriginal(true);
    setTimeout(() => setCopiedOriginal(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Article</DialogTitle>
          <DialogDescription className="line-clamp-1">
            {articleTitle}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Public Share Link Section */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-200">
              Public Share Link
            </label>
            {!shareUrl ? (
              <Button
                onClick={handleGenerateLink}
                disabled={generateShareLink.isPending}
                className="w-full"
              >
                {generateShareLink.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Link className="mr-2 size-4" />
                    Generate Public Link
                  </>
                )}
              </Button>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={shareUrl}
                  readOnly
                  className="bg-card flex-1 text-sm"
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleCopyShareUrl}
                  title="Copy link"
                >
                  {copied ? (
                    <Check className="size-4 text-green-500" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  asChild
                  title="Open in new tab"
                >
                  <a href={shareUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
              </div>
            )}
            <p className="text-xs text-gray-500">
              Anyone with this link can view the article (without your
              highlights)
            </p>
          </div>

          {/* Original Source Section */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-200">
              Original Source
            </label>
            <div className="flex gap-2">
              <Input
                value={originalUrl}
                readOnly
                className="bg-card flex-1 text-sm"
              />
              <Button
                size="icon"
                variant="outline"
                onClick={handleCopyOriginal}
                title="Copy original URL"
              >
                {copiedOriginal ? (
                  <Check className="size-4 text-green-500" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
              <Button
                size="icon"
                variant="outline"
                asChild
                title="Open original"
              >
                <a href={originalUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
