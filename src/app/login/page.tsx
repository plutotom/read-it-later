"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
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
  safeAuthReturnPath,
} from "~/lib/auth-errors";

export default function LoginPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [signInError, setSignInError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (session?.user) {
      const from = new URLSearchParams(window.location.search).get("from");
      router.push(safeAuthReturnPath(from, window.location.origin));
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
          <div className="text-muted-foreground text-center text-sm">
            or use your account password
          </div>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setIsSigningIn(true);
              setSignInError(null);
              const submitted = password;
              setPassword("");
              void authClient.signIn
                .email({ email, password: submitted })
                .then((result) => {
                  if (result.error)
                    setSignInError("That email or password was not accepted.");
                  else router.refresh();
                })
                .catch(() =>
                  setSignInError(
                    "Could not reach the sign-in server. Try again.",
                  ),
                )
                .finally(() => setIsSigningIn(false));
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isSigningIn || !email || !password}
            >
              Sign in with password
            </Button>
            <p className="text-muted-foreground text-xs">
              Add a password to your existing account in Preferences after
              signing in with Discord.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
