"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Info, RotateCw, X } from "lucide-react";
import * as Toast from "@radix-ui/react-toast";
import { Button } from "~/components/ui/button";

interface ArticleWebViewProps {
  url: string;
  title: string;
  showEmbeddingHint?: boolean;
  onDismissEmbeddingHint?: () => void;
}

export function ArticleWebView({
  url,
  title,
  showEmbeddingHint = false,
  onDismissEmbeddingHint,
}: ArticleWebViewProps) {
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
      className="relative flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom,0px)]"
    >
      <div className="border-rule bg-surface flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-b px-4 py-2 sm:px-8">
        {isMixedContent && (
          <p className="text-muted-foreground min-w-0 flex-1 text-xs leading-relaxed">
            This site needs to open in a new tab.
          </p>
        )}
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
            // available above; this event only dismisses the loading indicator.
            setIsLoading(false);
          }}
        />
      )}
      {isMixedContent === false && (
        <Toast.Provider duration={7_000} swipeDirection="down">
          <Toast.Root
            open={showEmbeddingHint}
            onOpenChange={(open) => {
              if (!open) onDismissEmbeddingHint?.();
            }}
            type="background"
            className="border-rule bg-background/95 text-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-bottom-3 data-[state=closed]:slide-out-to-bottom-2 pointer-events-auto relative flex w-full max-w-md items-start gap-3 rounded-2xl border p-4 shadow-[0_8px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl duration-300 ease-out data-[swipe=end]:translate-y-[calc(100%+2rem)] data-[swipe=move]:translate-y-[var(--radix-toast-swipe-move-y)] data-[swipe=move]:transition-none motion-reduce:animate-none motion-reduce:transition-none"
          >
            <span className="bg-accent/10 text-accent mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
              <Info className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 py-0.5">
              <Toast.Title className="text-sm font-medium">
                Page blank or missing something?
              </Toast.Title>
              <Toast.Description className="text-muted-foreground mt-1 text-xs leading-relaxed">
                Some sites don’t allow embedded viewing. Use Open original above
                to read the page in a new tab.
              </Toast.Description>
            </div>
            <Toast.Close asChild>
              <button
                type="button"
                aria-label="Dismiss Web view tip"
                className="text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:ring-accent -mt-1 -mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </Toast.Close>
          </Toast.Root>
          <Toast.Viewport
            label="Web view tip"
            className="pointer-events-none absolute inset-x-0 bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] z-30 m-0 flex list-none justify-center px-4 outline-none sm:px-6"
          />
        </Toast.Provider>
      )}
    </section>
  );
}
