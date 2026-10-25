"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "~/server/auth";
import { allowAuthAttempt } from "~/server/services/native-auth/rate-limit";

const inputSchema = z.object({
  newPassword: z.string().min(12).max(128),
  currentPassword: z.string().max(128).optional(),
});

export async function saveNativePassword(input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    return { error: "Use a password between 12 and 128 characters." };
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const context = await auth.$context;
  if (!origin || !context.trustedOrigins.includes(origin))
    return { error: "Open password setup on this website and try again." };
  const session = await auth.api.getSession({
    headers: requestHeaders,
    query: { disableCookieCache: true },
  });
  if (!session) return { error: "Sign in with Discord first." };
  // Password enrollment must prove a recent social sign-in, not just a long-lived cookie.
  if (Date.now() - session.session.createdAt.getTime() > 10 * 60_000) {
    return {
      error: "Sign in with Discord again before changing your password.",
      reauthenticate: true,
    };
  }
  try {
    if (!(await allowAuthAttempt(`password-setup:${session.user.id}`, 3)))
      return { error: "Wait a minute before trying again." };
    if (parsed.data.currentPassword) {
      await auth.api.changePassword({
        headers: requestHeaders,
        body: {
          currentPassword: parsed.data.currentPassword,
          newPassword: parsed.data.newPassword,
          revokeOtherSessions: true,
        },
      });
    } else {
      await auth.api.setPassword({
        headers: requestHeaders,
        body: { newPassword: parsed.data.newPassword },
      });
    }
  } catch {
    return {
      error:
        "Could not save the password. If you already have one, enter your current password too.",
    };
  }
  // Password changes rotate the cookie. Navigate after it is applied rather than
  // rendering this request again with the just-revoked session cookie.
  redirect("/native/password?passwordSaved=1");
}
