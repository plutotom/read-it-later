"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL:
    typeof window !== "undefined"
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_AUTH_URL ?? process.env.AUTH_URL ?? ""),
});

// Directly use Better Auth's React hook exports
export const { signIn, signOut, useSession } = authClient;
