import { Plus, X } from "lucide-react";
import { useContext, useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { GeneralContext } from "../(protected)/contexts/general-context";

/** Pixels from the top of the document before the FAB slides away. */
const SCROLL_AWAY_THRESHOLD_PX = 28;

export function AddArticleButton() {
  const {
    isAddFormOpen,
    setIsAddFormOpen,
    setMetadataEditArticle,
    metadataEditArticle,
  } = useContext(GeneralContext);

  const [awayFromTop, setAwayFromTop] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const rafScroll = useRef<number | null>(null);

  const composerOpen = isAddFormOpen || metadataEditArticle != null;
  const fabHidden = !composerOpen && awayFromTop;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReduceMotion(mq.matches);
    syncMotion();
    mq.addEventListener("change", syncMotion);
    return () => mq.removeEventListener("change", syncMotion);
  }, []);

  useEffect(() => {
    const readScrollY = () =>
      window.scrollY ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0;

    const flush = () => {
      rafScroll.current = null;
      setAwayFromTop(readScrollY() > SCROLL_AWAY_THRESHOLD_PX);
    };

    const onScroll = () => {
      if (rafScroll.current != null) return;
      rafScroll.current = window.requestAnimationFrame(flush);
    };

    flush();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafScroll.current != null) {
        window.cancelAnimationFrame(rafScroll.current);
      }
    };
  }, []);

  useEffect(() => {
    // add event listener for esc button to close the add article form
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsAddFormOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []); // Remove isAddFormOpen dependency to prevent re-adding listeners

  return (
    <div
      className={cn(
        "fixed right-4 bottom-4 left-4 z-50 sm:right-6 sm:bottom-6 sm:left-auto",
        "will-change-transform",
        "transition-[transform,opacity]",
        reduceMotion
          ? "duration-150 ease-out"
          : "duration-420 ease-[cubic-bezier(0.2,0.82,0.15,1)]",
        fabHidden
          ? "translate-y-[calc(100%+1.25rem)] opacity-0"
          : "translate-y-0 opacity-100",
        fabHidden && "pointer-events-none",
      )}
      aria-hidden={fabHidden}
    >
      <Button
        type="button"
        tabIndex={fabHidden ? -1 : undefined}
        onClick={() => {
          setIsAddFormOpen(!isAddFormOpen);
          setMetadataEditArticle(null);
        }}
        className="h-12 w-full rounded-full border border-rule bg-surface px-5 text-sm font-medium text-foreground shadow-soft transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:bg-background-deep hover:text-foreground active:translate-y-0 sm:h-12 sm:w-auto sm:min-w-[11rem]"
        aria-label={
          isAddFormOpen ? "Close add article form" : "Open add article form"
        }
      >
        {isAddFormOpen ? (
          <>
            <X className="mr-2 h-4 w-4 transition-all duration-200 ease-in-out" />
            Close composer
          </>
        ) : (
          <>
            <Plus className="mr-2 h-4 w-4 transition-all duration-200 ease-in-out" />
            Add article
          </>
        )}
      </Button>
    </div>
  );
}
