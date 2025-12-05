"use client";
import { useRouter } from "next/navigation";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { Separator } from "~/components/ui/separator";
import { Button } from "~/components/ui/button";
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
              <span className="text-sm text-gray-400">
                {session.user.name ?? session.user.email}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="text-gray-300 hover:bg-gray-700 hover:text-white"
              >
                Sign out
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
