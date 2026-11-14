"use client";

import { SidebarProvider } from "~/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { DesktopNav } from "./DesktopNav";
import { GeneralProvider } from "../(protected)/contexts/general-context";
import { AddArticleButton } from "./AddArticleButton";
import { AddArticleFormCard } from "./AddArticleFormCard";

interface LayoutProps {
  children: React.ReactNode;
  pageTitle: string;
  /** Hide the add-article composer. Use on manifesto-style pages. */
  showComposer?: boolean;
}

/**
 * Main application layout with navigation
 * Provides sidebar on mobile, header nav on desktop
 */
export function Layout({
  children,
  pageTitle,
  showComposer = true,
}: LayoutProps) {
  return (
    <GeneralProvider>
      <SidebarProvider defaultOpen={false}>
        <div className="bg-background flex min-h-screen w-full flex-col">
          <DesktopNav pageTitle={pageTitle} />

          <div className="md:hidden">
            <AppSidebar />
          </div>

          <main className="bg-background flex-1">{children}</main>
          {showComposer ? <AddArticleButton /> : null}
        </div>
        {showComposer ? <AddArticleFormCard /> : null}
      </SidebarProvider>
    </GeneralProvider>
  );
}
