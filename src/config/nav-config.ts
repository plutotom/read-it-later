import { Home, FolderArchive, Tablet, type LucideIcon } from "lucide-react";

/**
 * Shared navigation configuration
 * Single source of truth for all navigation items across the app
 */

export interface NavItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  description?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/**
 * Library places. Inbox and Archive are destinations; unread is a mark on a
 * row, not a third place. Folders come later.
 */
export const mainNavItems: NavItem[] = [
  {
    title: "Inbox",
    url: "/",
    icon: Home,
    description: "The working pile",
  },
  {
    title: "Archive",
    url: "/archived",
    icon: FolderArchive,
    description: "Out of the pile, still in your library",
  },
  {
    title: "Para",
    url: "/para",
    icon: Tablet,
    description: "E-reader sync queue",
  },
];

export function getMainNavItems(options?: {
  paraEnabled?: boolean;
}): NavItem[] {
  if (options?.paraEnabled === false) {
    return mainNavItems.filter((item) => item.url !== "/para");
  }
  return mainNavItems;
}

/**
 * Navigation groups for sidebar organization
 */
export const navGroups: NavGroup[] = [
  { title: "Articles", items: mainNavItems },
];

export function getNavGroups(options?: { paraEnabled?: boolean }): NavGroup[] {
  return [{ title: "Articles", items: getMainNavItems(options) }];
}

/**
 * Legacy format for backwards compatibility with existing components
 */
export const navData = {
  navMain: navGroups.map((group) => ({
    title: group.title,
    items: group.items.map((item) => ({
      title: item.title,
      url: item.url,
    })),
  })),
};
