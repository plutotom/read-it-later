"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { authClient, useSession } from "~/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (session?.user) {
      const from = new URLSearchParams(window.location.search).get("from");
      router.push(from ?? "/");
    }
  }, [session, router]);

  const handleDiscordSignIn = async () => {
    await authClient.signIn.social({
      provider: "discord",
      callbackURL: "/",
    });
  };

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (session?.user) {
    return null; // Will redirect via useEffect
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to Read It Later</CardTitle>
          <CardDescription>
            Sign in with Discord to access your saved articles
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleDiscordSignIn}
            className="w-full"
            size="lg"
            variant="default"
          >
            Sign in with Discord
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
