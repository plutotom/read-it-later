/**
 * Add Article Form Component
 * Mobile-optimized form for adding new articles
 */

"use client";

import { useState } from "react";
import { type Folder } from "~/types/folder";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Alert, AlertDescription } from "~/components/ui/alert";

interface AddArticleFormProps {
  onSubmit: (data: {
    url: string;
    folderId?: string;
    tags?: string[];
  }) => Promise<void>;
  folders?: Folder[];
  isLoading?: boolean;
  onCancel?: () => void;
}

export function AddArticleForm({
  onSubmit,
  folders = [],
  isLoading = false,
  onCancel,
}: AddArticleFormProps) {
  const [url, setUrl] = useState("");
  const [folderId, setFolderId] = useState<string>("");
  const [tagsInput, setTagsInput] = useState("");
  const [errors, setErrors] = useState<{ url?: string; general?: string }>({});
  const [pasteError, setPasteError] = useState(false);
  const [isPasting, setIsPasting] = useState(false);

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
    const newErrors: { url?: string; general?: string } = {};

    if (!url.trim()) {
      newErrors.url = "URL is required";
    } else if (!validateUrl(url.trim())) {
      newErrors.url = "Please enter a valid URL";
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

      await onSubmit({
        url: url.trim(),
        folderId: folderId || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });

      // Reset form on success
      setUrl("");
      setFolderId("");
      setTagsInput("");
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

  const handlePasteAndSave = async () => {
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* URL input */}
      <div className="space-y-2">
        <Label htmlFor="url">Article URL *</Label>
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
          className={errors.url ? "border-red-500" : ""}
        />
        {errors.url && <p className="text-sm text-red-600">{errors.url}</p>}
        <p className="text-muted-foreground text-xs">
          Paste any article URL and we'll extract the content for you
        </p>
      </div>

      {/* Folder selection */}
      {folders && folders.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="folder">Folder (optional)</Label>
          <select
            id="folder"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            disabled={isLoading || isPasting}
            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">No folder</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {/* Tags input */}
      {/* <div className="space-y-2">
        <Label htmlFor="tags">Tags (optional)</Label>
        <Input
          id="tags"
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="javascript, tutorial, web development"
          disabled={isLoading || isPasting}
        />
        <p className="text-muted-foreground text-xs">
          Separate tags with commas
        </p>
      </div> */}

      {/* Error message */}
      {errors.general && (
        <Alert variant="destructive">
          <AlertDescription>{errors.general}</AlertDescription>
        </Alert>
      )}

      {/* Action buttons */}
      <div className="space-y-3 pt-4">
        {/* Primary action buttons - side by side on desktop, stacked on mobile */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="submit"
            disabled={isLoading || !url.trim() || isPasting}
            className="w-full sm:w-auto"
          >
            {isLoading ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Adding Article...
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
                Add Article
              </>
            )}
          </Button>

          <Button
            type="button"
            onClick={handlePasteAndSave}
            disabled={isLoading || isPasting}
            variant={pasteError ? "destructive" : "default"}
            className={`w-full sm:w-auto ${
              !pasteError ? "bg-green-600 hover:bg-green-700" : ""
            }`}
          >
            {isPasting ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Pasting...
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
        </div>

        {/* Cancel button */}
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
