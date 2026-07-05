"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { authClient, useSession } from "~/lib/auth-client";
import {
  getOAuthCallbackErrorMessage,
  getSignInErrorMessage,
} from "~/lib/auth-errors";

export default function LoginPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [signInError, setSignInError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    if (session?.user) {
      const from = new URLSearchParams(window.location.search).get("from");
      router.push(from ?? "/");
    }
  }, [session, router]);

  useEffect(() => {
    const callbackError = getOAuthCallbackErrorMessage(
      new URLSearchParams(window.location.search),
    );
    if (callbackError) {
      setSignInError(callbackError);
    }
  }, []);

  const handleDiscordSignIn = async () => {
    setSignInError(null);
    setIsSigningIn(true);

    try {
      const result = await authClient.signIn.social({
        provider: "discord",
        callbackURL: "/",
      });

      if (result.error) {
        setSignInError(getSignInErrorMessage(result.error));
      }
    } catch (error) {
      setSignInError(getSignInErrorMessage(error));
    } finally {
      setIsSigningIn(false);
    }
  };

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (session?.user) {
    return null;
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to Read It Later</CardTitle>
          <CardDescription>
            Sign in with Discord to access your saved articles
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {signInError ? (
            <Alert variant="destructive">
              <AlertDescription>{signInError}</AlertDescription>
            </Alert>
          ) : null}

          <Button
            onClick={handleDiscordSignIn}
            className="w-full"
            size="lg"
            variant="default"
            disabled={isSigningIn}
          >
            {isSigningIn ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Connecting to Discord...
              </>
            ) : (
              "Sign in with Discord"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
