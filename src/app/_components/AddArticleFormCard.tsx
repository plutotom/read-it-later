import { GeneralContext } from "../(protected)/contexts/general-context";
import { useContext, useEffect, useMemo } from "react";
import { cn } from "~/lib/utils";
import { AddArticleForm } from "./add-article-form";
import { api } from "~/trpc/react";
import { X } from "lucide-react";
import { Button } from "~/components/ui/button";

export function AddArticleFormCard() {
  const {
    isAddFormOpen,
    setIsAddFormOpen,
    metadataEditArticle,
    setMetadataEditArticle,
  } = useContext(GeneralContext);
  const utils = api.useUtils();
  const isMetadataMode = !!metadataEditArticle;
  const isOpen = isAddFormOpen || isMetadataMode;

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setIsAddFormOpen(false);
      setMetadataEditArticle(null);
    }
  };

  const handleClose = () => {
    setIsAddFormOpen(false);
    setMetadataEditArticle(null);
  };

  const { data: folders } = api.folder.getAll.useQuery(undefined, {
    staleTime: 60_000,
  });

  const createArticle = api.article.create.useMutation({
    onSuccess: () => {
      void utils.article.getAll.invalidate();
      handleClose();
    },
  });

  const createArticleFromText = api.article.createFromText.useMutation({
    onSuccess: () => {
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
      className={cn(
        "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
        isOpen ? "block" : "hidden",
      )}
    >
      <div
        className="flex h-full items-end justify-center p-0 sm:items-center sm:p-4"
        onClick={handleOverlayClick}
      >
        <div
          className="relative z-10 flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-[1.75rem] border border-rule bg-surface shadow-strong m-fade-up sm:max-h-[90vh] sm:max-w-md sm:rounded-[1.75rem]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 border-b border-rule bg-surface/95 px-4 pt-3 pb-4 backdrop-blur-xl sm:px-5 sm:pt-4">
            <div className="mb-3 flex justify-center sm:hidden">
              <div className="h-1.5 w-12 rounded-full bg-rule" />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2
                  className="text-[1.65rem] leading-[1.05] font-medium tracking-tight text-foreground"
                  style={{ fontFamily: "var(--font-app-display)" }}
                >
                  {headerTitle}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-foreground-soft">
                  {headerDescription}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:bg-background-deep hover:text-foreground"
                aria-label="Close add article composer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div
            className="flex-1 overflow-y-auto px-4 py-4 sm:px-5"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <AddArticleForm
              onSubmit={handleArticleSubmit}
              folders={folders}
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
          </div>
        </div>
      </div>
    </div>
  );
}
