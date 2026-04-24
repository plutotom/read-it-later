import "~/styles/globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import {
  Geist,
  Inter,
  Newsreader,
  Source_Serif_4,
} from "next/font/google";

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

// Applied before hydration to eliminate a theme flash. Mirrors the
// allow-list in `theme-switcher.tsx`.
const THEME_BOOTSTRAP = `(() => {
  try {
    var t = localStorage.getItem('ril.theme');
    var allowed = ['ember','parchment','forest','cobalt','matter','matter-dark'];
    if (!t || allowed.indexOf(t) === -1) t = 'ember';
    var r = document.documentElement;
    r.setAttribute('data-theme', t);
    if (t === 'parchment' || t === 'matter') r.classList.remove('dark'); else r.classList.add('dark');
  } catch (_) {
    document.documentElement.setAttribute('data-theme', 'ember');
    document.documentElement.classList.add('dark');
  }
})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`dark ${geist.variable} ${inter.variable} ${newsreader.variable} ${sourceSerif4.variable}`}
      data-theme="ember"
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="bg-background font-sans antialiased">{children}</body>
    </html>
  );
}
