/**
 * Add Article Form Component
 * Mobile-optimized form for adding new articles
 */

"use client";

import { useEffect, useState } from "react";
import { type Folder } from "~/types/folder";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Alert, AlertDescription } from "~/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { RichTextInput } from "./rich-text-input";
import { FileText, Link } from "lucide-react";
import { cn } from "~/lib/utils";

type AddArticleFormVariant = "add" | "metadata";

interface AddArticleFormProps {
  onSubmit: (data: {
    url?: string;
    content?: string;
    title?: string;
    author?: string;
    publishedAt?: Date;
    folderId?: string;
    tags?: string[];
  }) => Promise<void>;
  folders?: Folder[];
  isLoading?: boolean;
  onCancel?: () => void;
  variant?: AddArticleFormVariant;
  initialValues?: {
    url?: string;
    title?: string;
    folderId?: string;
    tags?: string[];
  };
  submitLabel?: string;
}

export function AddArticleForm({
  onSubmit,
  folders = [],
  isLoading = false,
  onCancel,
  variant = "add",
  initialValues,
  submitLabel,
}: AddArticleFormProps) {
  const isMetadataMode = variant === "metadata";

  const [url, setUrl] = useState(initialValues?.url ?? "");
  const [folderId, setFolderId] = useState<string>(
    initialValues?.folderId ?? "",
  );
  const [tagsInput, setTagsInput] = useState(
    initialValues?.tags?.join(", ") ?? "",
  );
  const [errors, setErrors] = useState<{
    url?: string;
    general?: string;
    title?: string;
  }>({});
  const [pasteError, setPasteError] = useState(false);
  const [isPasting, setIsPasting] = useState(false);

  // Text mode state
  const [isTextMode, setIsTextMode] = useState(false);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [author, setAuthor] = useState("");
  const [detectedMetadata, setDetectedMetadata] = useState<{
    title?: string;
    author?: string;
  }>({});

  useEffect(() => {
    if (initialValues) {
      setUrl(initialValues.url ?? "");
      setTitle(initialValues.title ?? "");
      setFolderId(initialValues.folderId ?? "");
      setTagsInput(initialValues.tags?.join(", ") ?? "");
    }
  }, [initialValues]);

  const validateUrl = (urlString: string) => {
    try {
      new URL(urlString);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Validation
    const newErrors: { url?: string; general?: string; title?: string } = {};

    if (isMetadataMode) {
      if (!title.trim()) {
        newErrors.title = "Title is required";
      }
      if (!url.trim()) {
        newErrors.url = "URL is required";
      } else if (!validateUrl(url.trim())) {
        newErrors.url = "Please enter a valid URL";
      }
    } else if (isTextMode) {
      // Text mode validation
      if (!content.trim()) {
        newErrors.general = "Content is required";
      }
      if (!title.trim()) {
        newErrors.title = "Title is required";
      }
      if (url.trim() && !validateUrl(url.trim())) {
        newErrors.url = "Please enter a valid URL";
      }
    } else {
      // URL mode validation
      if (!url.trim()) {
        newErrors.url = "URL is required";
      } else if (!validateUrl(url.trim())) {
        newErrors.url = "Please enter a valid URL";
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      // Parse tags
      const tags = tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      if (isMetadataMode) {
        await onSubmit({
          url: url.trim(),
          title: title.trim(),
          folderId: folderId || undefined,
          tags: tags.length > 0 ? tags : undefined,
        });
        return;
      }

      if (isTextMode) {
        await onSubmit({
          content: content.trim(),
          title: title.trim(),
          author: author.trim() || undefined,
          publishedAt: new Date(),
          folderId: folderId || undefined,
          tags: tags.length > 0 ? tags : undefined,
          url: url.trim() || undefined,
        });
      } else {
        await onSubmit({
          url: url.trim(),
          folderId: folderId || undefined,
          tags: tags.length > 0 ? tags : undefined,
        });
      }

      // Reset form on success (add flow only)
      if (!isMetadataMode) {
        setUrl("");
        setFolderId("");
        setTagsInput("");
        setContent("");
        setTitle("");
        setAuthor("");
        setDetectedMetadata({});
        setIsTextMode(false);
      }
    } catch (error) {
      setErrors({
        general:
          error instanceof Error ? error.message : "Failed to add article",
      });
    }
  };

  const handleUrlPaste = async (e: React.ClipboardEvent) => {
    const pastedText = e.clipboardData.getData("text");
    if (validateUrl(pastedText)) {
      setUrl(pastedText);
      setErrors({});
    }
  };

  const handleMetadataDetected = (metadata: {
    title?: string;
    author?: string;
  }) => {
    setDetectedMetadata(metadata);
    if (metadata.title && !title) {
      setTitle(metadata.title);
    }
    if (metadata.author && !author) {
      setAuthor(metadata.author);
    }
  };

  const handlePasteAndSave = async () => {
    if (isMetadataMode) return;

    setIsPasting(true);
    setPasteError(false);
    setErrors({});

    try {
      // Check if clipboard API is available
      if (!navigator.clipboard) {
        throw new Error("Clipboard API not available");
      }

      // Read from clipboard
      const clipboardText = await navigator.clipboard.readText();

      // Validate URL
      if (!validateUrl(clipboardText)) {
        throw new Error("Invalid URL in clipboard");
      }

      // Set URL and auto-submit
      setUrl(clipboardText);

      // Parse tags
      const tags = tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      await onSubmit({
        url: clipboardText,
        folderId: folderId || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });

      // Reset form on success
      setUrl("");
      setFolderId("");
      setTagsInput("");
    } catch (error) {
      console.error("Failed to paste and save:", error);
      setPasteError(true);
      // Reset error state after 3 seconds
      setTimeout(() => setPasteError(false), 3000);
    } finally {
      setIsPasting(false);
    }
  };

  const primaryLabel =
    submitLabel ||
    (isMetadataMode
      ? "Save metadata"
      : isTextMode
        ? "Save Article"
        : "Add Article");
  const loadingLabel = isMetadataMode
    ? "Saving changes..."
    : isTextMode
      ? "Saving Article..."
      : "Adding Article...";
  const isSubmitDisabled =
    isLoading ||
    isPasting ||
    (isMetadataMode
      ? !title.trim() || !url.trim()
      : (!isTextMode && !url.trim()) ||
        (isTextMode && (!content.trim() || !title.trim())));
  const inputClassName =
    "border-rule bg-background-deep text-foreground placeholder:text-muted-foreground focus-visible:ring-ring/30";

  if (isMetadataMode) {
    return (
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="metadata-title" className="text-foreground-soft">
              Title *
            </Label>
            <Input
              id="metadata-title"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errors.title) setErrors({ ...errors, title: undefined });
              }}
              placeholder="Enter article title"
              disabled={isLoading || isPasting}
              className={cn(inputClassName, errors.title && "border-red-500")}
            />
            {errors.title && (
              <p className="text-sm text-red-600">{errors.title}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="metadata-url" className="text-foreground-soft">
              URL *
            </Label>
            <Input
              id="metadata-url"
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (errors.url) setErrors({ ...errors, url: undefined });
              }}
              onPaste={handleUrlPaste}
              placeholder="https://example.com/article"
              disabled={isLoading || isPasting}
              className={cn(inputClassName, errors.url && "border-red-500")}
            />
            {errors.url && <p className="text-sm text-red-600">{errors.url}</p>}
          </div>
        </div>

        {errors.general && (
          <Alert variant="destructive">
            <AlertDescription>{errors.general}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3 border-t border-rule pt-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="submit"
              disabled={isSubmitDisabled}
              className="h-11 w-full rounded-full bg-accent text-accent-foreground hover:bg-accent/90 sm:w-auto"
            >
              {isLoading ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {loadingLabel}
                </>
              ) : (
                <>
                  <svg
                    className="mr-2 h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                  {primaryLabel}
                </>
              )}
            </Button>
          </div>

          {onCancel && (
            <div className="flex justify-center sm:justify-start">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isLoading || isPasting}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-2xl border border-rule bg-background-deep p-3">
        <Button
          type="button"
          onClick={handlePasteAndSave}
          disabled={isLoading || isPasting}
          variant={pasteError ? "destructive" : "default"}
          className={cn(
            "h-12 w-full rounded-xl text-sm font-medium",
            !pasteError &&
              "bg-accent text-accent-foreground hover:bg-accent/90",
          )}
        >
          {isPasting ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Pasting from clipboard...
            </>
          ) : pasteError ? (
            <>
              <svg
                className="mr-2 h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Problem getting clipboard
            </>
          ) : (
            <>
              <svg
                className="mr-2 h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              Paste link and save
            </>
          )}
        </Button>

        <p className="mt-2 text-center text-xs leading-relaxed text-muted-foreground">
          Fastest on mobile: grab the current clipboard link and save in one tap.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-full border border-rule bg-background-deep p-1">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setIsTextMode(false)}
          disabled={isLoading || isPasting}
          className={cn(
            "h-10 rounded-full text-sm",
            !isTextMode
              ? "bg-surface text-foreground shadow-soft hover:bg-surface"
              : "text-foreground-soft hover:bg-transparent hover:text-foreground",
          )}
        >
          <Link className="mr-2 h-4 w-4" />
          Add from URL
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setIsTextMode(true)}
          disabled={isLoading || isPasting}
          className={cn(
            "h-10 rounded-full text-sm",
            isTextMode
              ? "bg-surface text-foreground shadow-soft hover:bg-surface"
              : "text-foreground-soft hover:bg-transparent hover:text-foreground",
          )}
        >
          <FileText className="mr-2 h-4 w-4" />
          Add from Text
        </Button>
      </div>

      {!isTextMode ? (
        <div className="space-y-2">
          <Label htmlFor="url" className="text-foreground-soft">
            Article URL
          </Label>
          <Input
            id="url"
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (errors.url) setErrors({ ...errors, url: undefined });
            }}
            onPaste={handleUrlPaste}
            placeholder="https://example.com/article"
            disabled={isLoading || isPasting}
            className={cn(inputClassName, errors.url && "border-red-500")}
          />
          {errors.url && <p className="text-sm text-red-600">{errors.url}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-foreground-soft">Article Content *</Label>
            <RichTextInput
              content={content}
              onContentChange={setContent}
              onMetadataDetected={handleMetadataDetected}
              disabled={isLoading || isPasting}
            />
            {errors.general && (
              <p className="text-sm text-red-600">{errors.general}</p>
            )}
          </div>

          {(detectedMetadata.title || detectedMetadata.author) && (
            <div className="rounded-2xl border border-rule bg-background-deep p-3">
              <p className="mb-2 text-sm font-medium text-foreground">
                Detected metadata:
              </p>
              {detectedMetadata.title && (
                <p className="text-sm text-foreground-soft">
                  <strong>Title:</strong> {detectedMetadata.title}
                </p>
              )}
              {detectedMetadata.author && (
                <p className="text-sm text-foreground-soft">
                  <strong>Author:</strong> {detectedMetadata.author}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title" className="text-foreground-soft">
              Title *
            </Label>
            <Input
              id="title"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errors.title) setErrors({ ...errors, title: undefined });
              }}
              placeholder="Enter article title"
              disabled={isLoading || isPasting}
              className={cn(inputClassName, errors.title && "border-red-500")}
            />
            {errors.title && (
              <p className="text-sm text-red-600">{errors.title}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="author" className="text-foreground-soft">
              Author (optional)
            </Label>
            <Input
              id="author"
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Enter author name"
              disabled={isLoading || isPasting}
              className={inputClassName}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="text-url" className="text-foreground-soft">
              Source URL (optional)
            </Label>
            <Input
              id="text-url"
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (errors.url) setErrors({ ...errors, url: undefined });
              }}
              onPaste={handleUrlPaste}
              placeholder="https://example.com/source-article"
              disabled={isLoading || isPasting}
              className={cn(inputClassName, errors.url && "border-red-500")}
            />
            {errors.url && <p className="text-sm text-red-600">{errors.url}</p>}
            <p className="text-xs text-muted-foreground">
              Optional: include a source URL for this rich text article.
            </p>
          </div>
        </div>
      )}

      {folders && folders.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="folder" className="text-foreground-soft">
            Folder (optional)
          </Label>
          <Select
            value={folderId}
            onValueChange={setFolderId}
            disabled={isLoading || isPasting}
          >
            <SelectTrigger id="folder" className={inputClassName}>
              <SelectValue placeholder="No folder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No folder</SelectItem>
              {folders.map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  {folder.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {errors.general && (
        <Alert variant="destructive">
          <AlertDescription>{errors.general}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-3 border-t border-rule pt-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="submit"
            disabled={isSubmitDisabled}
            className="h-11 w-full rounded-full bg-accent text-accent-foreground hover:bg-accent/90 sm:w-auto"
          >
            {isLoading ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                {loadingLabel}
              </>
            ) : (
              <>
                <svg
                  className="mr-2 h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  />
                </svg>
                {primaryLabel}
              </>
            )}
          </Button>

        </div>

        {onCancel && (
          <div className="flex justify-center sm:justify-start">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLoading || isPasting}
              className="h-11 w-full rounded-full border-rule bg-surface text-foreground-soft hover:bg-background-deep hover:text-foreground sm:w-auto"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
