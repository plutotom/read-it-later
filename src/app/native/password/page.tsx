import { headers } from "next/headers";
import { auth } from "~/server/auth";
import { NativePasswordForm } from "./password-form";

export default async function NativePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ passwordSaved?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const context = await auth.$context;
  return (
    <NativePasswordForm
      email={session?.user.email ?? null}
      saved={(await searchParams).passwordSaved === "1"}
      discordAvailable={context.socialProviders.some(
        (provider) => provider.id === "discord",
      )}
    />
  );
}
