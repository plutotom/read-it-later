import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { TRPCReactProvider } from "~/trpc/react";
import { AppToaster } from "~/app/_components/app-toaster";
import { BrowserStorageProvider } from "~/app/_components/browser-storage-provider";

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <TRPCReactProvider>
      <BrowserStorageProvider userId={session.user.id}>
        <div className="bg-background min-h-screen">{children}</div>
        <AppToaster />
      </BrowserStorageProvider>
    </TRPCReactProvider>
  );
}
