"use client";

import { useRouter } from "next/navigation";
import { Settings, LogOut, ChevronDown, MoreHorizontal } from "lucide-react";
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
import { ThemeSwitcher } from "./theme-switcher";
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
export function UserMenu({
  showName = true,
  variant = "dropdown",
}: UserMenuProps) {
  const router = useRouter();
  const { data: session } = useSession();

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  if (!session?.user) {
    return null;
  }

  const userInitial = (session.user.name ?? session.user.email ?? "U")
    .charAt(0)
    .toUpperCase();

  // Sidebar variant - compact menu trigger for the Matter footer row
  if (variant === "sidebar") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56 border-rule bg-surface text-foreground shadow-[var(--shadow-soft)]"
        >
          <DropdownMenuLabel className="flex items-center gap-3 text-foreground">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
              {userInitial}
            </div>
            <span className="truncate">{session.user.name ?? session.user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-rule" />
          <ThemeSwitcher className="px-2 py-1" />
          <DropdownMenuSeparator className="bg-rule" />
          <DropdownMenuItem
            onClick={() => router.push("/preferences")}
            className="cursor-pointer text-foreground-soft focus:bg-background-deep focus:text-foreground"
          >
            <Settings className="mr-2 h-4 w-4" />
            Preferences
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => void handleSignOut()}
            className="cursor-pointer text-foreground-soft focus:bg-background-deep focus:text-foreground"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
            "text-foreground-soft hover:bg-foreground/10 hover:text-foreground",
          )}
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent">
            <span className="text-xs font-medium text-accent-foreground">
              {userInitial}
            </span>
          </div>
          {showName && (
            <span className="max-w-[100px] truncate">
              {session.user.name ?? session.user.email}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 border-rule bg-surface text-foreground shadow-[var(--shadow-soft)]"
      >
        <DropdownMenuLabel className="text-foreground-soft">
          {showName ? "My Account" : (session.user.name ?? session.user.email)}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-rule" />

        {/* TTS Usage Progress Bar */}
        <TTSUsageDisplay compact />

        <DropdownMenuSeparator className="bg-rule" />
        <ThemeSwitcher />
        <DropdownMenuSeparator className="bg-rule" />
        <DropdownMenuItem
          onClick={() => router.push("/preferences")}
          className="cursor-pointer text-foreground-soft focus:bg-background-deep focus:text-foreground"
        >
          <Settings className="mr-2 h-4 w-4" />
          Preferences
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-rule" />
        <DropdownMenuItem
          onClick={() => void handleSignOut()}
          className="cursor-pointer text-foreground-soft focus:bg-background-deep focus:text-foreground"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
