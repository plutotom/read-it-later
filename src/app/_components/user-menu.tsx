"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, LogOut, ChevronDown } from "lucide-react";
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
import { useBrowserStorage } from "./browser-storage-provider";

interface UserMenuProps {
  /** Whether to show the username next to the icon */
  showName?: boolean;
  /** Display variant - dropdown for headers, sidebar for an in-drawer panel */
  variant?: "dropdown" | "sidebar";
}

/**
 * Shared user menu component
 * Supports dropdown (header) and sidebar (inline expandable) variants
 */
export function UserMenu({
  showName = true,
  variant = "dropdown",
}: UserMenuProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [accountOpen, setAccountOpen] = useState(false);
  const storage = useBrowserStorage();

  const handleSignOut = async () => {
    // Storage failure must not prevent server-side sign-out.
    try {
      await storage?.clear(true, true);
    } catch {
      /* Browser may deny storage. */
    }
    storage?.dispose();
    await authClient.signOut();
    router.push("/login");
  };

  if (!session?.user) {
    return null;
  }

  const userInitial = (session.user.name ?? session.user.email ?? "U")
    .charAt(0)
    .toUpperCase();
  const displayName = session.user.name ?? session.user.email ?? "User";

  // Sidebar variant — expand in place so the theme picker never overlays nav
  if (variant === "sidebar") {
    return (
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => setAccountOpen((open) => !open)}
          className={cn(
            "flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors",
            "hover:bg-foreground/10",
            accountOpen && "bg-foreground/10",
          )}
          aria-expanded={accountOpen}
          aria-controls="sidebar-account-panel"
        >
          <div className="bg-accent text-accent-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium">
            {userInitial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-foreground truncate text-sm font-medium">
              {displayName}
            </p>
            <p className="text-muted-foreground text-xs">
              {accountOpen ? "Hide account" : "Account & theme"}
            </p>
          </div>
          <ChevronDown
            className={cn(
              "text-muted-foreground h-4 w-4 shrink-0 transition-transform",
              accountOpen && "rotate-180",
            )}
          />
        </button>

        {accountOpen && (
          <div
            id="sidebar-account-panel"
            className="border-rule mt-2 space-y-1 border-t pt-3"
          >
            <ThemeSwitcher variant="panel" />
            <button
              type="button"
              onClick={() => router.push("/preferences")}
              className="text-foreground-soft hover:bg-foreground/10 hover:text-foreground flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm"
            >
              <Settings className="h-4 w-4" />
              Preferences
            </button>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="text-foreground-soft hover:bg-foreground/10 hover:text-foreground flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        )}
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
            "text-foreground-soft hover:bg-foreground/10 hover:text-foreground",
          )}
        >
          <div className="bg-accent flex h-6 w-6 items-center justify-center rounded-full">
            <span className="text-accent-foreground text-xs font-medium">
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
        className="border-rule bg-surface text-foreground w-64 shadow-[var(--shadow-soft)]"
      >
        <DropdownMenuLabel className="text-foreground-soft">
          {showName ? "My Account" : (session.user.name ?? session.user.email)}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-rule" />

        <TTSUsageDisplay compact />

        <DropdownMenuSeparator className="bg-rule" />
        <ThemeSwitcher />
        <DropdownMenuSeparator className="bg-rule" />
        <DropdownMenuItem
          onClick={() => router.push("/preferences")}
          className="text-foreground-soft focus:bg-background-deep focus:text-foreground cursor-pointer"
        >
          <Settings className="mr-2 h-4 w-4" />
          Preferences
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-rule" />
        <DropdownMenuItem
          onClick={() => void handleSignOut()}
          className="text-foreground-soft focus:bg-background-deep focus:text-foreground cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
