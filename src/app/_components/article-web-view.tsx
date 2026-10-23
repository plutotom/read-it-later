"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RotateCw } from "lucide-react";
import { Button } from "~/components/ui/button";

interface ArticleWebViewProps {
  url: string;
  title: string;
}

export function ArticleWebView({ url, title }: ArticleWebViewProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSlow, setIsSlow] = useState(false);
  // Wait for the browser's protocol before mounting a frame, so an HTTP URL
  // never briefly mounts inside an HTTPS reader during the first render.
  const [isMixedContent, setIsMixedContent] = useState<boolean | null>(null);

  useEffect(() => {
    setIsMixedContent(
      window.location.protocol === "https:" &&
        new URL(url).protocol === "http:",
    );
    const timer = window.setTimeout(() => setIsSlow(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [url, reloadKey]);

  return (
    <section
      aria-label="Original website"
      className="flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom,0px)]"
    >
      <div className="border-rule bg-surface flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-2 sm:px-8">
        <p className="text-muted-foreground min-w-0 flex-1 text-xs leading-relaxed">
          {isMixedContent
            ? "This site needs to open in a new tab."
            : "Page blank or missing something? Some sites don't allow embedded viewing."}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {isMixedContent === false && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
              aria-label="Reload original website"
              onClick={() => {
                setIsLoading(true);
                setIsSlow(false);
                setReloadKey((key) => key + 1);
              }}
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="text-foreground-soft h-9 rounded-full text-xs"
          >
            <a href={url} target="_blank" rel="noopener noreferrer">
              Open original
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" aria-hidden />
            </a>
          </Button>
        </div>
      </div>
      {isMixedContent === false && isLoading && (
        <p
          role="status"
          className="text-muted-foreground px-4 py-2 text-xs sm:px-8"
        >
          {isSlow
            ? "Taking a while? You can open the original above or switch back to Reader."
            : "Loading original website…"}
        </p>
      )}
      {isMixedContent === false && (
        <iframe
          key={reloadKey}
          src={url}
          title={`Original website: ${title}`}
          className="min-h-0 w-full flex-1 border-0 bg-white"
          // Keep an opaque origin, including after redirects back to our app.
          // Scripts can render visuals but cannot access our session or parent DOM.
          sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          allow="fullscreen"
          onLoad={() => {
            // Browsers also emit load for blocked frames. Keep the fallback
            // visible above; this event only dismisses the loading indicator.
            setIsLoading(false);
          }}
        />
      )}
    </section>
  );
}
