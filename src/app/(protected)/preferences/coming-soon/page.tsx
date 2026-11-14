import { Barlow_Condensed, Cormorant_Garamond } from "next/font/google";
import { Layout } from "~/app/_components/layout";
import { ComingSoon } from "~/app/_components/coming-soon";
import { cn } from "~/lib/utils";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
});

const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-barlow-condensed",
});

export default function ComingSoonPage() {
  return (
    <Layout pageTitle="Coming next" showComposer={false}>
      <ComingSoon className={cn(cormorant.variable, barlow.variable)} />
    </Layout>
  );
}
