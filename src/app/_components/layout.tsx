"use client";

import { SidebarProvider } from "~/components/ui/sidebar";

import { AppSidebar } from "./AppSidebar";
import { DesktopNav } from "./DesktopNav";
import { GeneralProvider } from "../(protected)/contexts/general-context";
import { AddArticleButton } from "../_components/AddArticleButton";

import { AddArticleFormCard } from "./AddArticleFormCard";

interface LayoutProps {
  children: React.ReactNode;
  pageTitle: string;
}
// Navigation data for the sidebar
const navData = {
  navMain: [
    {
      title: "Articles",
      items: [
        {
          title: "Inbox",
          url: "/",
        },
        {
          title: "Archived",
          url: "/archived",
        },
        // {
        //   title: "Search",
        //   url: "/search",
        // },
      ],
    },
    // {
    //   title: "Management",
    //   items: [
    //     {
    //       title: "Add Article",
    //       url: "/add",
    //     },
    //     {
    //       title: "Folders",
    //       url: "/folder",
    //     },
    //     {
    //       title: "Bookmarks",
    //       url: "/bookmarklet",
    //     },
    //   ],
    // },
  ],
};

export function Layout({ children, pageTitle }: LayoutProps) {
  return (
    <GeneralProvider>
      <SidebarProvider defaultOpen={false}>
        <div className="flex min-h-screen flex-col bg-gray-900">
          {/* Header - Always visible */}
          <DesktopNav navData={navData} pageTitle={pageTitle} />

          {/* Sidebar - Only visible on mobile */}
          <div className="md:hidden">
            <AppSidebar navData={navData} />
          </div>

          <main className="flex-1">{children}</main>
          <AddArticleButton />
        </div>
        <AddArticleFormCard />
      </SidebarProvider>
    </GeneralProvider>
  );
}
