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
import { cn } from "~/lib/utils";

interface UserMenuProps {
  /** Whether to show the username next to the icon */
  showName?: boolean;
  /** Display variant - dropdown for headers, sidebar for inline display */
  variant?: "dropdown" | "sidebar";
}

/**
 * Shared user menu component
 * Supports dropdown (header) and sidebar (inline) variants
 */
export function UserMenu({ showName = true, variant = "dropdown" }: UserMenuProps) {
  const router = useRouter();
  const { data: session } = useSession();

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  if (!session?.user) {
    return null;
  }

  // Sidebar variant - inline buttons instead of dropdown
  if (variant === "sidebar") {
    return (
      <div className="space-y-1">
        <button
          onClick={() => router.push("/preferences")}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <Settings className="h-4 w-4" />
          <span>Preferences</span>
        </button>
        <button
          onClick={() => void handleSignOut()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign out</span>
        </button>
      </div>
    );
  }

  // Dropdown variant - for headers
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "flex items-center gap-2 transition-all duration-200",
            "text-gray-300 hover:bg-white/10 hover:text-white"
          )}
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600">
            <span className="text-xs font-medium text-white">
              {(session.user.name ?? session.user.email ?? "U").charAt(0).toUpperCase()}
            </span>
          </div>
          {showName && (
            <span className="max-w-[100px] truncate">{session.user.name ?? session.user.email}</span>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="w-64 border-white/10 bg-background/95 backdrop-blur-lg"
      >
        <DropdownMenuLabel className="text-gray-400">
          {showName ? "My Account" : (session.user.name ?? session.user.email)}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/10" />

        {/* TTS Usage Progress Bar */}
        <TTSUsageDisplay compact />

        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem 
          onClick={() => router.push("/preferences")}
          className="cursor-pointer text-gray-300 focus:bg-white/10 focus:text-white"
        >
          <Settings className="mr-2 h-4 w-4" />
          Preferences
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem 
          onClick={() => void handleSignOut()}
          className="cursor-pointer text-gray-300 focus:bg-red-500/10 focus:text-red-400"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
