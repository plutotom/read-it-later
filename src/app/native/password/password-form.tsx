"use client";

import { useState } from "react";
import { authClient } from "~/lib/auth-client";
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
import { saveNativePassword } from "./actions";

export function NativePasswordForm({
  email,
  discordAvailable,
  saved,
}: {
  email: string | null;
  discordAvailable: boolean;
  saved: boolean;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [current, setCurrent] = useState("");
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [reauthenticate, setReauthenticate] = useState(false);

  async function signIn() {
    setBusy(true);
    try {
      if (email) await authClient.signOut();
      const result = await authClient.signIn.social({
        provider: "discord",
        callbackURL: "/native/password",
      });
      if (result.error)
        setMessage("Could not start Discord sign-in. Try again.");
    } catch {
      setMessage("Could not start Discord sign-in. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="bg-background text-foreground flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in on your iPhone</CardTitle>
          <CardDescription>
            Add a password to your existing Read It Later account, then use the
            same email and password in Paper Drive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {(!email || reauthenticate) && !discordAvailable ? (
            <p>
              Discord sign-in is temporarily unavailable. If you already have a
              password,{" "}
              <a className="underline" href="/login?from=/native/password">
                sign in with your password
              </a>
              .
            </p>
          ) : !email || reauthenticate ? (
            <Button
              className="w-full"
              disabled={busy}
              onClick={() => void signIn()}
            >
              Continue with Discord
            </Button>
          ) : (
            <>
              <p className="text-sm">
                Account: <strong>{email}</strong>
              </p>
              {saved ? (
                <p role="status">
                  Password saved. Return to Paper Drive and sign in. Your
                  library will stay on this iPhone until library sync is added.
                </p>
              ) : (
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (password !== confirm) {
                      setMessage("The passwords do not match.");
                      return;
                    }
                    setBusy(true);
                    setMessage("");
                    void saveNativePassword({
                      newPassword: password,
                      ...(changing ? { currentPassword: current } : {}),
                    })
                      .then((result) => {
                        setPassword("");
                        setConfirm("");
                        setCurrent("");
                        if (result.error) {
                          setMessage(result.error);
                          setReauthenticate(result.reauthenticate ?? false);
                        } else {
                          // Reopen with the rotated cookie after the action response is applied.
                          window.location.assign(
                            "/native/password?passwordSaved=1",
                          );
                        }
                      })
                      .catch(() =>
                        setMessage("Could not reach the server. Try again."),
                      )
                      .finally(() => setBusy(false));
                  }}
                >
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={changing}
                      onChange={(e) => setChanging(e.target.checked)}
                    />
                    I already have a password
                  </label>
                  {changing ? (
                    <div className="space-y-2">
                      <Label htmlFor="current">Current password</Label>
                      <Input
                        id="current"
                        type="password"
                        autoComplete="current-password"
                        required
                        value={current}
                        onChange={(e) => setCurrent(e.target.value)}
                      />
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <Label htmlFor="password">New password</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={12}
                      maxLength={128}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm">Confirm password</Label>
                    <Input
                      id="confirm"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={12}
                      maxLength={128}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </div>
                  <Button className="w-full" disabled={busy} type="submit">
                    {busy ? "Saving…" : "Save password"}
                  </Button>
                </form>
              )}
            </>
          )}
          {message && !saved ? (
            <p role="alert" className="text-destructive text-sm">
              {message}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
