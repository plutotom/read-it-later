import { TRPCReactProvider } from "~/trpc/react";

export default function SharedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TRPCReactProvider>
      <div className="bg-background min-h-screen">{children}</div>
    </TRPCReactProvider>
  );
}
