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
import { X } from "lucide-react";
import { Button } from "~/components/ui/button";

/**
 * Mobile sidebar navigation.
 * Primary destinations stay in the scrollable body; account/theme live in the
 * footer so they never overlay the nav.
 */
export function AppSidebar() {
  const { data: session } = useSession();
  const { setOpenMobile, isMobile } = useSidebar();

  const handleNavClick = () => {
    setOpenMobile(false);
  };

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader className="bg-sidebar px-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="bg-accent flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[15px] leading-none font-bold text-white shadow-[var(--shadow-soft)]">
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
              className="text-foreground truncate text-base font-medium tracking-tight"
              style={{ fontFamily: "var(--font-app-display)" }}
            >
              Read It Later
            </h2>
          </div>
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground h-10 w-10 shrink-0 rounded-full"
              onClick={() => setOpenMobile(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-sidebar px-3 py-3">
        {navGroups.map((group) => (
          <SidebarGroup key={group.title} className="p-0">
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1.5">
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
      </SidebarContent>

      {session?.user && (
        <SidebarFooter className="bg-sidebar border-rule border-t px-3 pt-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
          <UserMenu showName={false} variant="sidebar" />
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
