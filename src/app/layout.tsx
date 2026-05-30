import "~/styles/globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import Script from "next/script";
import {
  Geist,
  Inter,
  Newsreader,
  Source_Serif_4,
} from "next/font/google";

import { ThemeProvider } from "~/app/_components/theme-provider";
import {
  THEME_BOOTSTRAP_SCRIPT,
  THEME_COOKIE_KEY,
  isLightTheme,
  resolveTheme,
} from "~/lib/theme";
import { cn } from "~/lib/utils";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-newsreader",
});

const sourceSerif4 = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-source-serif-4",
});

export const metadata: Metadata = {
  title: "Read It Later",
  description:
    "Save articles to read later. Extract clean, readable content from any web page.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#3b82f6",
  userScalable: false,
  viewportFit: "cover",
};

/** Cookie-driven theme on <html> must not be statically cached. */
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  const theme = resolveTheme(cookieStore.get(THEME_COOKIE_KEY)?.value);
  const isLight = isLightTheme(theme);

  return (
    <html
      lang="en"
      data-theme={theme}
      className={cn(!isLight && "dark")}
      suppressHydrationWarning
    >
      <body
        className={cn(
          geist.variable,
          inter.variable,
          newsreader.variable,
          sourceSerif4.variable,
          "bg-background font-sans antialiased",
        )}
      >
        <Script id="ril-theme-bootstrap" strategy="beforeInteractive">
          {THEME_BOOTSTRAP_SCRIPT}
        </Script>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
