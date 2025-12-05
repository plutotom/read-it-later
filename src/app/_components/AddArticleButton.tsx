import { Plus, X } from "lucide-react";
import { useContext, useEffect } from "react";
import { Button } from "~/components/ui/button";
import { GeneralContext } from "../(protected)/contexts/general-context";

export function AddArticleButton() {
  const { isAddFormOpen, setIsAddFormOpen } = useContext(GeneralContext);

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
    <div className="fixed right-4 bottom-4 z-50">
      <Button
        variant="outline"
        size="icon"
        onClick={() => {
          setIsAddFormOpen(!isAddFormOpen);
        }}
        className="transition-transform duration-200 ease-in-out hover:scale-110 active:scale-95"
        aria-label={
          isAddFormOpen ? "Close add article form" : "Open add article form"
        }
      >
        {isAddFormOpen ? (
          <X className="h-4 w-4 transition-all duration-200 ease-in-out" />
        ) : (
          <Plus className="h-4 w-4 transition-all duration-200 ease-in-out" />
        )}
      </Button>
    </div>
  );
}
