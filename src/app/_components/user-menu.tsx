"use client";

import { useRouter } from "next/navigation";
import { Settings, LogOut, ChevronDown, User } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { authClient, useSession } from "~/lib/auth-client";
import { TTSUsageDisplay } from "./tts-usage-display";

interface UserMenuProps {
  /** Whether to show the username next to the icon (desktop nav shows it, article header hides it) */
  showName?: boolean;
}

/**
 * Shared user menu dropdown component
 * Used in both DesktopNav and ArticleReaderHeader for consistent UX
 */
export function UserMenu({ showName = true }: UserMenuProps) {
  const router = useRouter();
  const { data: session } = useSession();

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  if (!session?.user) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2 text-gray-300 hover:bg-gray-700 hover:text-white"
        >
          <User className="h-4 w-4" />
          {showName && (
            <span>{session.user.name ?? session.user.email}</span>
          )}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          {showName ? "My Account" : (session.user.name ?? session.user.email)}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* TTS Usage Progress Bar */}
        <TTSUsageDisplay compact />

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/preferences")}>
          <Settings className="mr-2 h-4 w-4" />
          Preferences
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void handleSignOut()}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
