"use client";

import { useRouter } from "next/navigation";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "~/components/ui/sidebar";
import { Separator } from "~/components/ui/separator";
import { navGroups, type NavItem } from "~/config/nav-config";
import { NavLink } from "./navigation/NavLink";
import { UserMenu } from "./user-menu";
import { useSession } from "~/lib/auth-client";
import { X } from "lucide-react";
import { Button } from "~/components/ui/button";

/**
 * Mobile sidebar navigation with modern glass design
 * Includes navigation links and user menu
 */
export function AppSidebar() {
  const { data: session } = useSession();
  const { setOpenMobile } = useSidebar();

  const handleNavClick = () => {
    // Close sidebar on navigation
    setOpenMobile(false);
  };

  return (
    <Sidebar className="border-r-0">
      {/* Header with glass effect */}
      <SidebarHeader className="border-b border-white/5 bg-gradient-to-b from-gray-800/50 to-transparent px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
              <span className="text-sm font-bold text-white">R</span>
            </div>
            <h2 className="text-lg font-semibold text-white">
              Read It Later
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-400 hover:text-white"
            onClick={() => setOpenMobile(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </SidebarHeader>

      {/* Navigation content */}
      <SidebarContent className="px-2 py-4">
        {navGroups.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel className="px-3 text-xs font-medium uppercase tracking-wider text-gray-500">
              {group.title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="mt-2 space-y-1">
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

      {/* Footer with user menu */}
      {session?.user && (
        <SidebarFooter className="border-t border-white/5 p-4">
          <div className="rounded-lg bg-white/5 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600">
                <span className="text-sm font-medium text-white">
                  {(session.user.name ?? session.user.email ?? "U").charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {session.user.name ?? "User"}
                </p>
                <p className="truncate text-xs text-gray-400">
                  {session.user.email}
                </p>
              </div>
            </div>
            <Separator className="my-3 bg-white/10" />
            <UserMenu showName={false} variant="sidebar" />
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
