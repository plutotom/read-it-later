import { TRPCReactProvider } from "~/trpc/react";

export default function SharedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TRPCReactProvider>{children}</TRPCReactProvider>;
}
