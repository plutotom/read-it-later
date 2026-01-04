import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { TRPCReactProvider } from "~/trpc/react";
import { InstallPrompt } from "../_components/install-prompt";
import { ServiceWorkerRegistration } from "../_components/service-worker-registration";

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
      <div className="min-h-screen bg-background">{children}</div>
      <InstallPrompt />
      <ServiceWorkerRegistration />
    </TRPCReactProvider>
  );
}
