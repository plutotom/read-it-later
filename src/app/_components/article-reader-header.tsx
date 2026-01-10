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
import { Archive, Settings, ArrowLeft } from "lucide-react";
import { api } from "~/trpc/react";
import { useRouter } from "next/navigation";
import { HighlightsMenu } from "./highlights-menu";
import { Separator } from "~/components/ui/separator";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { useSession } from "~/lib/auth-client";
import { UserMenu } from "./user-menu";
import { NavLink } from "./navigation/NavLink";
import { mainNavItems } from "~/config/nav-config";
import { cn } from "~/lib/utils";

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
    const hasHistory =
      typeof window !== "undefined" && window.history.length > 2;
    const referrer = typeof document !== "undefined" ? document.referrer : "";
    const isFromSameOrigin =
      referrer &&
      typeof window !== "undefined" &&
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
    <div className="bg-background/80 sticky top-0 z-10 border-b border-white/5 px-4 py-3 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        {/* Left side: Mobile sidebar trigger, Back button, and navigation */}
        <div className="flex items-center gap-2">
          {/* Mobile: Sidebar trigger (same as main layout) */}
          <div className="md:hidden">
            <SidebarTrigger className="h-8 w-8 text-gray-400 hover:text-white" />
          </div>

          {/* Back button with smart navigation */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackClick}
            className="flex items-center gap-1 text-gray-400 hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden text-sm md:inline">Back</span>
          </Button>

          <Separator
            orientation="vertical"
            className="mx-1 hidden h-5 bg-white/10 md:block"
          />

          {/* Desktop navigation links */}
          <nav className="hidden items-center gap-1 md:flex">
            {mainNavItems.map((item) => (
              <NavLink key={item.title} item={item} variant="desktop" />
            ))}
          </nav>
        </div>

        {/* Right side: Article actions */}
        <div className="flex items-center gap-1">
          {/* Highlights menu */}
          <HighlightsMenu
            highlights={highlights}
            onHighlightDelete={onHighlightDelete}
            onHighlightNoteUpdate={onHighlightNoteUpdate}
          />

          {/* Reading settings */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSettings}
            className={cn(
              showSettings
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:bg-white/5 hover:text-white",
            )}
            aria-label="Reading settings"
          >
            <Settings className="h-4 w-4" />
          </Button>

          {/* Share button */}
          <Button
            size="icon"
            variant="ghost"
            onClick={handleShare}
            aria-label="Share article"
            className="text-gray-400 hover:bg-white/5 hover:text-white"
          >
            <svg
              className="h-4 w-4"
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
            <Button
              variant="ghost"
              size="sm"
              onClick={onUnarchive}
              className="text-gray-400 hover:bg-white/5 hover:text-white"
            >
              <Archive className="h-4 w-4 md:mr-1.5" />
              <span className="hidden md:inline">Unarchive</span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onArchive}
              className="text-gray-400 hover:bg-white/5 hover:text-white"
            >
              <Archive className="h-4 w-4 md:mr-1.5" />
              <span className="hidden md:inline">Archive</span>
            </Button>
          )}

          {/* User menu (desktop only - mobile uses sidebar) */}
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
