import { headers } from "next/headers";
import { auth } from "~/server/auth";
import { isPasswordSetupSessionFresh } from "~/server/services/native-auth/password-session";
import { hasAccountPassword } from "~/server/services/native-auth/password-status";
import { NativePasswordForm } from "./password-form";

export default async function NativePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ passwordSaved?: string }>;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
  const context = await auth.$context;
  const hasPassword = session
    ? await hasAccountPassword(session.user.id)
    : false;
  return (
    <NativePasswordForm
      email={session?.user.email ?? null}
      hasPassword={hasPassword}
      requiresReauthentication={
        session
          ? !isPasswordSetupSessionFresh(session.session.createdAt)
          : false
      }
      saved={(await searchParams).passwordSaved === "1"}
      discordAvailable={context.socialProviders.some(
        (provider) => provider.id === "discord",
      )}
    />
  );
}
