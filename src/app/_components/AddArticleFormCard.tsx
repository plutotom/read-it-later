import { GeneralContext } from "../(protected)/contexts/general-context";
import { useContext, useRef, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { cn } from "~/lib/utils";
import { AddArticleForm } from "./add-article-form";
import { api } from "~/trpc/react";

export function AddArticleFormCard() {
  const { isAddFormOpen, setIsAddFormOpen } = useContext(GeneralContext);
  const backdropRef = useRef<HTMLDivElement>(null);
  const justOpenedRef = useRef(false);
  const utils = api.useUtils();

  // Prevent click away from firing immediately when form opens
  useEffect(() => {
    if (isAddFormOpen) {
      justOpenedRef.current = true;
      const timer = setTimeout(() => {
        justOpenedRef.current = false;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isAddFormOpen]);

  // Close form when clicking on backdrop
  const handleBackdropClick = (e: React.MouseEvent) => {
    console.log("handleBackdropClick");
    // Only close if clicking on backdrop area (not on the card)
    const clickedElement = e.target as HTMLElement;
    const cardElement =
      clickedElement.closest("[data-radix-card]") ||
      clickedElement.closest(".relative.z-10");

    if (!cardElement && !justOpenedRef.current) {
      setIsAddFormOpen(false);
    }
  };

  // const { data: articles, isLoading, error } = api.article.getAll.useQuery();
  // const { data: folders } = api.folder.getAll.useQuery();
  const createArticle = api.article.create.useMutation({
    onSuccess: () => {
      // Invalidate and refetch the articles list
      void utils.article.getAll.invalidate();
      setIsAddFormOpen(false);
    },
  });

  const createArticleFromText = api.article.createFromText.useMutation({
    onSuccess: () => {
      // Invalidate and refetch the articles list
      void utils.article.getAll.invalidate();
      setIsAddFormOpen(false);
    },
  });
  const handleArticleSubmit = async (data: {
    url?: string;
    content?: string;
    title?: string;
    author?: string;
    publishedAt?: Date;
    folderId?: string;
    tags?: string[];
  }) => {
    if (data.url) {
      // URL mode
      await createArticle.mutateAsync({
        url: data.url,
        folderId: data.folderId,
        tags: data.tags,
      });
    } else if (data.content && data.title) {
      // Text mode
      await createArticleFromText.mutateAsync({
        content: data.content,
        title: data.title,
        author: data.author,
        publishedAt: data.publishedAt,
        folderId: data.folderId,
        tags: data.tags,
      });
    }
  };

  return (
    <div
      ref={backdropRef}
      className={cn(
        "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
        isAddFormOpen ? "block" : "hidden",
      )}
      onClick={handleBackdropClick}
    >
      <div className="flex h-full items-center justify-center p-4">
        <Card className="relative z-10 w-full max-w-md max-h-[90vh] flex flex-col">
          <CardHeader className="flex-shrink-0">
            <CardTitle>Add New Article</CardTitle>
            <CardDescription>
              Paste a URL to save an article for later reading
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            <AddArticleForm
              onSubmit={handleArticleSubmit}
              // folders={folders}
              isLoading={
                createArticle.isPending || createArticleFromText.isPending
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
