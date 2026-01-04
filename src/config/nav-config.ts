import { Home, FolderArchive, type LucideIcon } from "lucide-react";

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
 * Main navigation items available throughout the app
 */
export const mainNavItems: NavItem[] = [
  { 
    title: "Inbox", 
    url: "/", 
    icon: Home,
    description: "Articles to read"
  },
  { 
    title: "Archived", 
    url: "/archived", 
    icon: FolderArchive,
    description: "Saved articles"
  },
];

/**
 * Navigation groups for sidebar organization
 */
export const navGroups: NavGroup[] = [
  { title: "Articles", items: mainNavItems },
];

/**
 * Legacy format for backwards compatibility with existing components
 */
export const navData = {
  navMain: navGroups.map(group => ({
    title: group.title,
    items: group.items.map(item => ({
      title: item.title,
      url: item.url,
    })),
  })),
};
