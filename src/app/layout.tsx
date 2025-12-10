import "~/styles/globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist } from "next/font/google";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "Read It Later",
  description:
    "Save articles to read later. Extract clean, readable content from any web page.",
  icons: [
    { rel: "icon", url: "/favicon.ico" },
    { rel: "apple-touch-icon", url: "/apple-touch-icon.png" },
    { rel: "icon", url: "/favicon-96x96.png", sizes: "96x96" },
    { rel: "icon", url: "/web-app-manifest-192x192.png", sizes: "192x192" },
    { rel: "icon", url: "/web-app-manifest-512x512.png", sizes: "512x512" },
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Read It Later",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": "Read It Later",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#3b82f6",
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`dark ${geist.variable}`}>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Read It Later" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link
          rel="apple-touch-icon"
          sizes="152x152"
          href="/web-app-manifest-192x192.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/web-app-manifest-192x192.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="167x167"
          href="/web-app-manifest-192x192.png"
        />
        <link rel="manifest" href="/manifest.webmanifest" />
      </head>
      <body className="bg-gray-900 font-sans antialiased">{children}</body>
    </html>
  );
}






