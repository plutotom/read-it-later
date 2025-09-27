/**
 * Add Article Form Component
 * Mobile-optimized form for adding new articles
 */

"use client";

import { useState } from "react";
import { type Folder } from "~/types/folder";

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

  return (
    <div className="bg-white">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* URL input */}
        <div>
          <label
            htmlFor="url"
            className="mb-2 block text-sm font-medium text-gray-700"
          >
            Article URL *
          </label>
          <input
            id="url"
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (errors.url) setErrors({ ...errors, url: undefined });
            }}
            onPaste={handleUrlPaste}
            placeholder="https://example.com/article"
            disabled={isLoading}
            className={`w-full rounded-lg border px-3 py-3 text-sm transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none ${
              errors.url
                ? "border-red-300 bg-red-50"
                : "border-gray-300 bg-white hover:border-gray-400"
            }`}
          />
          {errors.url && (
            <p className="mt-1 text-sm text-red-600">{errors.url}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Paste any article URL and we'll extract the content for you
          </p>
        </div>

        {/* Folder selection */}
        {folders.length > 0 && (
          <div>
            <label
              htmlFor="folder"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Folder (optional)
            </label>
            <select
              id="folder"
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              disabled={isLoading}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
        <div>
          <label
            htmlFor="tags"
            className="mb-2 block text-sm font-medium text-gray-700"
          >
            Tags (optional)
          </label>
          <input
            id="tags"
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="javascript, tutorial, web development"
            disabled={isLoading}
            className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-500">
            Separate tags with commas
          </p>
        </div>

        {/* Error message */}
        {errors.general && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-600">{errors.general}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
          )}

          <button
            type="submit"
            disabled={isLoading || !url.trim()}
            className="flex items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
          </button>
        </div>
      </form>
    </div>
  );
}
