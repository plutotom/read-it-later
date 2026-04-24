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
}

/**
 * Main application layout with navigation
 * Provides sidebar on mobile, header nav on desktop
 */
export function Layout({ children, pageTitle }: LayoutProps) {
  return (
    <GeneralProvider>
      <SidebarProvider defaultOpen={false}>
        <div className="bg-background flex min-h-screen w-full flex-col">
          <DesktopNav pageTitle={pageTitle} />

          <div className="md:hidden">
            <AppSidebar />
          </div>

          <main className="flex-1 bg-background">{children}</main>
          <AddArticleButton />
        </div>
        <AddArticleFormCard />
      </SidebarProvider>
    </GeneralProvider>
  );
}
