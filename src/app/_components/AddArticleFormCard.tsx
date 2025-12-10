import { GeneralContext } from "../(protected)/contexts/general-context";
import { useContext, useRef, useEffect, useMemo } from "react";
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
  const {
    isAddFormOpen,
    setIsAddFormOpen,
    metadataEditArticle,
    setMetadataEditArticle,
  } = useContext(GeneralContext);
  const backdropRef = useRef<HTMLDivElement>(null);
  const justOpenedRef = useRef(false);
  const utils = api.useUtils();
  const isMetadataMode = !!metadataEditArticle;
  const isOpen = isAddFormOpen || isMetadataMode;

  // Prevent click away from firing immediately when form opens
  useEffect(() => {
    if (isOpen) {
      justOpenedRef.current = true;
      const timer = setTimeout(() => {
        justOpenedRef.current = false;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

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
      setMetadataEditArticle(null);
    }
  };

  const handleClose = () => {
    setIsAddFormOpen(false);
    setMetadataEditArticle(null);
  };

  // const { data: articles, isLoading, error } = api.article.getAll.useQuery();
  // const { data: folders } = api.folder.getAll.useQuery();
  const createArticle = api.article.create.useMutation({
    onSuccess: () => {
      // Invalidate and refetch the articles list
      void utils.article.getAll.invalidate();
      handleClose();
    },
  });

  const createArticleFromText = api.article.createFromText.useMutation({
    onSuccess: () => {
      // Invalidate and refetch the articles list
      void utils.article.getAll.invalidate();
      handleClose();
    },
  });
  const updateArticleMetadata = api.article.updateMetadata.useMutation({
    onSuccess: () => {
      void utils.article.getAll.invalidate();
      handleClose();
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
    if (metadataEditArticle) {
      await updateArticleMetadata.mutateAsync({
        id: metadataEditArticle.id,
        title: data.title ?? metadataEditArticle.title,
        url: data.url ?? metadataEditArticle.url,
      });
    } else if (data.url) {
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
        url: data.url,
      });
    }
  };

  const headerTitle = isMetadataMode
    ? "Edit Article Metadata"
    : "Add New Article";
  const headerDescription = isMetadataMode
    ? "Update the title and URL for this article"
    : "Paste a URL to save an article for later reading";

  const formInitialValues = useMemo(
    () =>
      metadataEditArticle
        ? {
            title: metadataEditArticle.title,
            url: metadataEditArticle.url,
          }
        : undefined,
    [metadataEditArticle],
  );

  return (
    <div
      ref={backdropRef}
      className={cn(
        "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
        isOpen ? "block" : "hidden",
      )}
      onClick={handleBackdropClick}
    >
      <div className="flex h-full items-center justify-center p-4">
        <Card className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col">
          <CardHeader className="shrink-0">
            <CardTitle>{headerTitle}</CardTitle>
            <CardDescription>{headerDescription}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            <AddArticleForm
              onSubmit={handleArticleSubmit}
              // folders={folders}
              isLoading={
                createArticle.isPending ||
                createArticleFromText.isPending ||
                updateArticleMetadata.isPending
              }
              variant={isMetadataMode ? "metadata" : "add"}
              initialValues={formInitialValues}
              submitLabel={isMetadataMode ? "Save changes" : undefined}
              onCancel={handleClose}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
