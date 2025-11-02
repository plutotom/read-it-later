/**
 * Article Reader Header Component
 * Header with navigation, settings, and share buttons
 */

"use client";

import { type Article } from "~/types/article";
import { type Highlight } from "~/types/annotation";
import { ReadingSettings } from "./reading-settings";
import { Button } from "~/components/ui/button";
import { Archive } from "lucide-react";
import { api } from "~/trpc/react";
import { useRouter } from "next/navigation";
import { HighlightsMenu } from "./highlights-menu";

interface ArticleReaderHeaderProps {
  article: Article;
  onBackClick?: () => void;
  showSettings: boolean;
  onToggleSettings: () => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  autoHighlight: boolean;
  onAutoHighlightChange: (enabled: boolean) => void;
  highlights?: Highlight[];
  onHighlightDelete?: (highlightId: string) => void;
}

export function ArticleReaderHeader({
  article,
  onBackClick,
  showSettings,
  onToggleSettings,
  fontSize,
  onFontSizeChange,
  autoHighlight,
  onAutoHighlightChange,
  highlights = [],
  onHighlightDelete,
}: ArticleReaderHeaderProps) {
  const { mutate: markAsRead } = api.article.markAsRead.useMutation();
  const { mutate: archive } = api.article.archive.useMutation();
  const { mutate: unarchive } = api.article.unarchive.useMutation();

  const router = useRouter();
  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: article.title,
        url: article.url,
      });
    } else {
      navigator.clipboard.writeText(article.url);
    }
  };

  const onArchive = () => {
    archive({ id: article.id });
    router.push(`/`);
  };

  const onUnarchive = () => {
    unarchive({ id: article.id });
    router.push(`/`);
  };

  return (
    <div className="sticky top-0 z-10 border-b border-gray-700 bg-gray-900 px-4 py-3">
      <div className="flex items-center justify-between">
        <button
          onClick={onBackClick}
          className="flex items-center text-gray-400 hover:text-gray-200"
        >
          <svg
            className="mr-1 h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back
        </button>

        <div className="flex items-center space-x-2">
          {/* Highlights menu */}
          <HighlightsMenu
            highlights={highlights}
            onHighlightDelete={onHighlightDelete}
          />

          {/* Reading settings */}
          <button
            onClick={onToggleSettings}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            aria-label="Reading settings"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>

          {/* Share button */}
          <Button
            // variant=""
            size="icon"
            onClick={handleShare}
            // className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            aria-label="Share article"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
              />
            </svg>
          </Button>
          {article.isArchived ? (
            <Button variant="outline" onClick={onUnarchive}>
              <Archive className="mr-2 h-4 w-4" />
              Unarchive Article
            </Button>
          ) : (
            <Button variant="outline" onClick={onArchive}>
              <Archive className="mr-2 h-4 w-4" />
              Archive Article
            </Button>
          )}
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <ReadingSettings
          fontSize={fontSize}
          onFontSizeChange={onFontSizeChange}
          autoHighlight={autoHighlight}
          onAutoHighlightChange={onAutoHighlightChange}
        />
      )}
    </div>
  );
}
