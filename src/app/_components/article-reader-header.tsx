/**
 * Article Reader Header Component
 * Header with navigation, settings, and share buttons
 */

"use client";

import { useState } from "react";
import { type Article } from "~/types/article";
import { type Highlight } from "~/types/annotation";
import { ReadingSettings } from "./reading-settings";
import { ShareDialog } from "./share-dialog";
import { Button } from "~/components/ui/button";
import { Archive, Settings, ChevronDown, ArrowLeft, Home, FolderArchive } from "lucide-react";
import { api } from "~/trpc/react";
import { useRouter } from "next/navigation";
import { HighlightsMenu } from "./highlights-menu";
import { Separator } from "~/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useSession } from "~/lib/auth-client";
import { UserMenu } from "./user-menu";

interface ArticleReaderHeaderProps {
  article: Article;
  showSettings: boolean;
  onToggleSettings: () => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  autoHighlight: boolean;
  onAutoHighlightChange: (enabled: boolean) => void;
  highlights?: Highlight[];
  onHighlightDelete?: (highlightId: string) => void;
  onHighlightNoteUpdate?: (highlightId: string, note: string | null) => void;
}

export function ArticleReaderHeader({
  article,
  showSettings,
  onToggleSettings,
  fontSize,
  onFontSizeChange,
  autoHighlight,
  onAutoHighlightChange,
  highlights = [],
  onHighlightDelete,
  onHighlightNoteUpdate,
}: ArticleReaderHeaderProps) {
  const [showShareDialog, setShowShareDialog] = useState(false);
  const { mutate: archive } = api.article.archive.useMutation();
  const { mutate: unarchive } = api.article.unarchive.useMutation();
  const { data: session } = useSession();

  const router = useRouter();
  
  // Smart back navigation: use history if available, otherwise go to inbox
  const handleBackClick = () => {
    // Check if we have meaningful history (more than just this page)
    // Also check if the referrer is from the same origin (user came from within the app)
    const hasHistory = typeof window !== "undefined" && window.history.length > 2;
    const referrer = typeof document !== "undefined" ? document.referrer : "";
    const isFromSameOrigin = referrer && typeof window !== "undefined" && 
      referrer.startsWith(window.location.origin);
    
    if (hasHistory && isFromSameOrigin) {
      router.back();
    } else {
      router.push("/");
    }
  };

  const handleShare = () => {
    setShowShareDialog(true);
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
        {/* Left side: Back button and navigation */}
        <div className="flex items-center gap-2">
          {/* Back button with smart navigation */}
          <button
            onClick={handleBackClick}
            className="flex items-center text-gray-400 hover:text-gray-200"
          >
            <ArrowLeft className="mr-1 h-5 w-5" />
            <span className="hidden sm:inline">Back</span>
          </button>

          <Separator orientation="vertical" className="mx-2 h-6 hidden sm:block" />

          {/* Desktop navigation links */}
          <nav className="hidden sm:flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/")}
              className="text-gray-300 hover:bg-gray-700 hover:text-white"
            >
              <Home className="mr-1 h-4 w-4" />
              Inbox
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/archived")}
              className="text-gray-300 hover:bg-gray-700 hover:text-white"
            >
              <FolderArchive className="mr-1 h-4 w-4" />
              Archived
            </Button>
          </nav>

          {/* Mobile navigation dropdown */}
          <div className="sm:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-gray-400">
                  Navigate
                  <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => router.push("/")}>
                  <Home className="mr-2 h-4 w-4" />
                  Inbox
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/archived")}>
                  <FolderArchive className="mr-2 h-4 w-4" />
                  Archived
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Right side: Article actions */}
        <div className="flex items-center space-x-2">
          {/* Highlights menu */}
          <HighlightsMenu
            highlights={highlights}
            onHighlightDelete={onHighlightDelete}
            onHighlightNoteUpdate={onHighlightNoteUpdate}
          />

          {/* Reading settings */}
          <button
            onClick={onToggleSettings}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            aria-label="Reading settings"
          >
            <Settings className="h-5 w-5" />
          </button>

          {/* Share button */}
          <Button
            size="icon"
            variant="ghost"
            onClick={handleShare}
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

          {/* Archive/Unarchive button */}
          {article.isArchived ? (
            <Button variant="outline" size="sm" onClick={onUnarchive}>
              <Archive className="mr-1 h-4 w-4" />
              <span className="hidden sm:inline">Unarchive</span>
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={onArchive}>
              <Archive className="mr-1 h-4 w-4" />
              <span className="hidden sm:inline">Archive</span>
            </Button>
          )}

          {/* User menu (desktop) - shared component */}
          {session?.user && (
            <div className="hidden md:block">
              <UserMenu showName={false} />
            </div>
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

      {/* Share dialog */}
      <ShareDialog
        articleId={article.id}
        articleTitle={article.title}
        originalUrl={article.url}
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
      />
    </div>
  );
}
