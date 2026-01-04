import { TRPCReactProvider } from "~/trpc/react";

export default function SharedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TRPCReactProvider>
      <div className="min-h-screen bg-background">{children}</div>
    </TRPCReactProvider>
  );
}
