"use client";

import { SidebarTrigger } from "~/components/ui/sidebar";
import { Separator } from "~/components/ui/separator";
import { useSession } from "~/lib/auth-client";
import { UserMenu } from "./user-menu";
import { NavLink } from "./navigation/NavLink";
import { mainNavItems } from "~/config/nav-config";

interface DesktopNavProps {
  pageTitle: string;
}

/**
 * Desktop navigation header with modern glass design
 * Shows hamburger menu on mobile, nav links on desktop
 */
export function DesktopNav({ pageTitle }: DesktopNavProps) {
  const { data: session } = useSession();

  return (
    <header className="bg-background/80 sticky top-0 z-40 border-b border-white/5 backdrop-blur-xl">
      <div className="flex h-14 items-center justify-between px-4">
        {/* Left side: Mobile trigger + Title */}
        <div className="flex items-center gap-3">
          {/* Mobile: Show sidebar trigger */}
          <div className="md:hidden">
            <SidebarTrigger className="h-8 w-8 text-gray-400 hover:text-white" />
          </div>

          {/* Logo/Brand */}
          <div className="flex items-center gap-2">
            <div className="hidden h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 md:flex">
              <span className="text-xs font-bold text-white">R</span>
            </div>
            <h1 className="text-lg font-semibold text-white">
              <span className="hidden md:inline">Read It Later: </span>
              {pageTitle}
            </h1>
          </div>
        </div>

        {/* Desktop: Show navigation links and user info */}
        <nav className="hidden items-center gap-1 md:flex">
          {mainNavItems.map((item) => (
            <NavLink key={item.title} item={item} variant="desktop" />
          ))}

          {session?.user && (
            <>
              <Separator
                orientation="vertical"
                className="mx-2 h-5 bg-white/10"
              />
              <UserMenu showName />
            </>
          )}
        </nav>

        {/* Mobile: User avatar indicator (menu is in sidebar) */}
        <div className="flex items-center md:hidden">
          {session?.user && (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600">
              <span className="text-xs font-medium text-white">
                {(session.user.name ?? session.user.email ?? "U")
                  .charAt(0)
                  .toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
