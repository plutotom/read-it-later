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
            <div className="bg-accent flex h-7 w-7 items-center justify-center rounded-[8px] text-[15px] leading-none font-bold text-white shadow-[var(--shadow-soft)]">
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
              className="text-foreground text-base font-medium tracking-tight"
              style={{ fontFamily: "var(--font-app-display)" }}
            >
              Read It Later
            </h2>
          </div>
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground h-8 w-8 rounded-full"
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

        <div className="bg-rule mx-3 my-4 h-px" />

        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              <SidebarMenuItem>
                <button
                  type="button"
                  className="text-foreground-soft hover:bg-foreground/10 hover:text-foreground flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
                >
                  <span className="bg-accent/70 h-2.5 w-2.5 rounded-[3px]" />
                  <span className="flex-1 text-left">Collections</span>
                  <ChevronDown className="text-muted-foreground h-4 w-4" />
                </button>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {session?.user && (
        <SidebarFooter className="bg-sidebar px-4 pt-2 pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-accent text-accent-foreground flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium">
              {userInitial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-foreground truncate text-sm font-medium">
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
