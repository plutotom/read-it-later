"use client";
import { useRouter } from "next/navigation";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { Separator } from "~/components/ui/separator";
import { Button } from "~/components/ui/button";
import { useSession } from "~/lib/auth-client";
import { UserMenu } from "./user-menu";

interface NavItem {
  title: string;
  url: string;
}

interface NavGroup {
  items: NavItem[];
}

interface NavData {
  navMain: NavGroup[];
}

export function DesktopNav({
  navData,
  pageTitle,
}: {
  navData: NavData;
  pageTitle: string;
}) {
  const router = useRouter();
  const { data: session } = useSession();

  // Flatten all navigation items from all groups
  const allNavItems = navData.navMain.flatMap((group) => group.items);

  return (
    <header className="border-b border-gray-700 bg-gray-800 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Mobile: Show sidebar trigger */}
          <div className="md:hidden">
            <SidebarTrigger className="h-7 w-7" />
            <Separator orientation="vertical" className="mr-2 h-4" />
          </div>
          <h1 className="text-xl font-bold text-white">
            Read It Later: {pageTitle}
          </h1>
        </div>
        {/* Desktop: Show navigation links and user info */}
        <nav className="hidden items-center gap-4 md:flex">
          {allNavItems.map((item) => (
            <Button
              key={item.title}
              variant="ghost"
              size="sm"
              onClick={() => router.push(item.url)}
              className="text-gray-300 hover:bg-gray-700 hover:text-white"
            >
              {item.title}
            </Button>
          ))}
          {session?.user && (
            <>
              <Separator orientation="vertical" className="h-4" />
              <UserMenu showName />
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
