"use client";
import { useRouter } from "next/navigation";
import { Settings, LogOut, ChevronDown, User } from "lucide-react";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { Separator } from "~/components/ui/separator";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { authClient, useSession } from "~/lib/auth-client";

export function DesktopNav({
  navData,
  pageTitle,
}: {
  navData: any;
  pageTitle: string;
}) {
  const router = useRouter();
  const { data: session } = useSession();

  // Flatten all navigation items from all groups
  const allNavItems = navData.navMain.flatMap((group: any) => group.items);

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/login");
  };

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
          {allNavItems.map((item: any) => (
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex items-center gap-2 text-gray-300 hover:bg-gray-700 hover:text-white"
                  >
                    <User className="h-4 w-4" />
                    <span>{session.user.name ?? session.user.email}</span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push("/preferences")}>
                    <Settings className="mr-2 h-4 w-4" />
                    Preferences
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
