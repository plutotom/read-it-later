import localFont from "next/font/local";
import { Layout } from "~/app/_components/layout";
import { ComingSoon } from "~/app/_components/coming-soon";
import { cn } from "~/lib/utils";

// Self-hosted latin subsets so `next build` does not hit Google Fonts.
// next/font/google currently crashes when Google returns extensionless
// `/l/font?kit=` URLs (TypeError reading '1' in the webpack loader).
const cormorant = localFont({
  src: [
    {
      path: "./fonts/cormorant-garamond-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/cormorant-garamond-latin-400-italic.woff2",
      weight: "400",
      style: "italic",
    },
    {
      path: "./fonts/cormorant-garamond-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/cormorant-garamond-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-cormorant",
  display: "swap",
});

const barlow = localFont({
  src: [
    {
      path: "./fonts/barlow-condensed-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/barlow-condensed-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-barlow-condensed",
  display: "swap",
});

export default function ComingSoonPage() {
  return (
    <Layout pageTitle="Coming next" showComposer={false}>
      <ComingSoon className={cn(cormorant.variable, barlow.variable)} />
    </Layout>
  );
}
