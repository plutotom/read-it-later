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
  const isActive =
    pathname === item.url ||
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
          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200",
          "text-foreground-soft hover:bg-foreground/10 hover:text-foreground",
          isActive && "bg-foreground/10 font-semibold text-foreground",
        )}
      >
        {Icon && (
          <Icon
            className={cn(
              "h-4 w-4 transition-colors",
              isActive ? "text-accent" : "text-muted-foreground",
            )}
          />
        )}
        <span>{item.title}</span>
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
        "text-foreground-soft transition-all duration-200",
        "hover:bg-foreground/10 hover:text-foreground",
        isActive && "bg-foreground/10 text-foreground",
      )}
    >
      {Icon && (
        <Icon
          className={cn(
            "mr-1.5 h-4 w-4",
            isActive ? "text-accent" : "text-muted-foreground",
          )}
        />
      )}
      {item.title}
    </Button>
  );
}
