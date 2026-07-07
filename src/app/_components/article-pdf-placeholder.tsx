"use client";

import { ExternalLink, FileText, Link2 } from "lucide-react";
import { Button } from "~/components/ui/button";

interface ArticlePdfPlaceholderProps {
  url: string;
  title: string;
}

export function ArticlePdfPlaceholder({ url, title }: ArticlePdfPlaceholderProps) {
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard may be unavailable; the open-original action is the fallback.
    }
  };

  return (
    <div className="rounded-2xl border border-rule bg-surface px-6 py-10 text-center shadow-[var(--shadow-soft)]">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
        <FileText className="h-7 w-7" aria-hidden />
      </div>

      <h2
        className="text-xl font-medium tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-app-display)" }}
      >
        This link is a PDF
      </h2>

      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-foreground-soft">
        We saved <span className="text-foreground">{title}</span>, but in-app PDF
        reading isn&apos;t available yet. Open the original file in your browser
        or download it from the source.
      </p>

      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button asChild className="rounded-full px-5">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
            Open original PDF
          </a>
        </Button>

        <Button
          type="button"
          variant="outline"
          className="rounded-full px-5"
          onClick={() => void handleCopyLink()}
        >
          <Link2 className="mr-2 h-4 w-4" aria-hidden />
          Copy link
        </Button>
      </div>
    </div>
  );
}
