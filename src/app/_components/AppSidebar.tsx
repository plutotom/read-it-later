"use client";

import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "~/components/ui/sidebar";
import { navGroups, type NavItem } from "~/config/nav-config";
import { NavLink } from "./navigation/NavLink";
import { UserMenu } from "./user-menu";
import { useSession } from "~/lib/auth-client";
import { ChevronDown, X } from "lucide-react";
import { Button } from "~/components/ui/button";

/**
 * Mobile sidebar navigation with modern glass design
 * Includes navigation links and user menu
 */
export function AppSidebar() {
  const { data: session } = useSession();
  const { setOpenMobile, isMobile } = useSidebar();

  const handleNavClick = () => {
    setOpenMobile(false);
  };

  const userInitial = (session?.user.name ?? session?.user.email ?? "U")
    .charAt(0)
    .toUpperCase();

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader className="bg-sidebar px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-accent text-[15px] font-bold leading-none text-white shadow-[var(--shadow-soft)]">
              <span
                style={{
                  fontFamily: "var(--font-app-display)",
                  letterSpacing: "-0.03em",
                }}
              >
                M
              </span>
            </div>
            <h2
              className="text-base font-medium tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-app-display)" }}
            >
              Read It Later
            </h2>
          </div>
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              onClick={() => setOpenMobile(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-sidebar px-3 py-2">
        {navGroups.map((group) => (
          <SidebarGroup key={group.title} className="p-0">
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {group.items.map((item: NavItem) => (
                  <SidebarMenuItem key={item.title}>
                    <NavLink
                      item={item}
                      variant="sidebar"
                      onClick={handleNavClick}
                    />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <div className="mx-3 my-4 h-px bg-rule" />

        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              <SidebarMenuItem>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground-soft transition-colors hover:bg-foreground/10 hover:text-foreground"
                >
                  <span className="h-2.5 w-2.5 rounded-[3px] bg-accent/70" />
                  <span className="flex-1 text-left">Collections</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {session?.user && (
        <SidebarFooter className="bg-sidebar px-4 pt-2 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-medium text-accent-foreground">
              {userInitial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {session.user.name ?? "User"}
              </p>
            </div>
            <div className="shrink-0">
              <UserMenu showName={false} variant="sidebar" />
            </div>
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
