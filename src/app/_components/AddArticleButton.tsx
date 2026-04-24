import { Plus, X } from "lucide-react";
import { useContext, useEffect } from "react";
import { Button } from "~/components/ui/button";
import { GeneralContext } from "../(protected)/contexts/general-context";

export function AddArticleButton() {
  const { isAddFormOpen, setIsAddFormOpen, setMetadataEditArticle } =
    useContext(GeneralContext);

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
    <div className="fixed right-4 bottom-4 left-4 z-50 sm:right-6 sm:bottom-6 sm:left-auto">
      <Button
        type="button"
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
