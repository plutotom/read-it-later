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
  const userInitial = (session?.user.name ?? session?.user.email ?? "U")
    .charAt(0)
    .toUpperCase();

  return (
    <header className="bg-background/90 sticky top-0 z-40 border-b border-rule backdrop-blur-xl">
      <div className="flex h-14 items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <div className="md:hidden">
            <SidebarTrigger className="h-8 w-8 rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground" />
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden h-7 w-7 items-center justify-center rounded-[8px] bg-accent text-white shadow-[var(--shadow-soft)] md:flex">
              <span
                className="text-[15px] font-bold leading-none"
                style={{
                  fontFamily: "var(--font-app-display)",
                  letterSpacing: "-0.03em",
                }}
              >
                M
              </span>
            </div>
            <h1
              className="text-lg font-medium tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-app-display)" }}
            >
              <span className="hidden md:inline">Read It Later</span>
              <span className="hidden text-foreground-soft md:inline"> / </span>
              {pageTitle}
            </h1>
          </div>
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          {mainNavItems.map((item) => (
            <NavLink key={item.title} item={item} variant="desktop" />
          ))}

          {session?.user && (
            <>
              <Separator
                orientation="vertical"
                className="mx-2 h-5 bg-rule"
              />
              <UserMenu showName />
            </>
          )}
        </nav>

        <div className="flex items-center md:hidden">
          {session?.user && (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent">
              <span className="text-xs font-medium text-accent-foreground">
                {userInitial}
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
