"use client";

import { useRouter, usePathname } from "next/navigation";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import type { NavItem } from "~/config/nav-config";

interface NavLinkProps {
  item: NavItem;
  variant?: "desktop" | "sidebar";
  onClick?: () => void;
}

/**
 * Reusable navigation link component with modern styling
 * Supports desktop header and sidebar variants
 */
export function NavLink({ item, variant = "desktop", onClick }: NavLinkProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isActive = pathname === item.url || 
    (item.url === "/" && pathname === "") ||
    (item.url !== "/" && pathname.startsWith(item.url));
  const Icon = item.icon;

  const handleClick = () => {
    router.push(item.url);
    onClick?.();
  };

  if (variant === "sidebar") {
    return (
      <button
        onClick={handleClick}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
          "text-gray-400 hover:bg-white/5 hover:text-white",
          isActive && "bg-gradient-to-r from-blue-500/20 to-purple-500/10 text-white"
        )}
      >
        {Icon && (
          <Icon className={cn(
            "h-4 w-4 transition-colors",
            isActive ? "text-blue-400" : "text-gray-500"
          )} />
        )}
        <span>{item.title}</span>
        {isActive && (
          <div className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400" />
        )}
      </button>
    );
  }

  // Desktop variant
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className={cn(
        "text-gray-300 transition-all duration-200",
        "hover:bg-white/10 hover:text-white",
        isActive && "bg-white/5 text-white"
      )}
    >
      {Icon && <Icon className="mr-1.5 h-4 w-4" />}
      {item.title}
    </Button>
  );
}
