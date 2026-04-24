import type { ReactNode } from "react";

/**
 * Minimal layout for theme preview pages. Deliberately does NOT wrap children
 * in the app chrome (bg-background, auth, sidebar) so each preview owns its
 * full aesthetic surface.
 */
export default function ThemesLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
