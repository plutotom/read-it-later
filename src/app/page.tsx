import Link from "next/link";

import { auth } from "@/server/auth";
import { HydrateClient } from "@/trpc/server";
import { ProfileExample } from "./_components/profile-example";

export default async function Home() {
  const session = await auth();

  return (
    <HydrateClient>
      <main className="min-h-screen bg-gradient-to-b from-[#0f172a] via-[#111827] to-[#0b1020] text-white">
        <section className="relative mx-auto flex max-w-5xl flex-col items-center px-6 py-20 text-center">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.2),transparent_40%),radial-gradient(circle_at_80%_30%,rgba(236,72,153,0.2),transparent_35%),radial-gradient(circle_at_50%_80%,rgba(16,185,129,0.15),transparent_35%)]" />
          <h1 className="mb-4 text-5xl font-extrabold tracking-tight sm:text-6xl">
            Find teams that match your values
          </h1>
          <p className="mb-8 max-w-2xl text-lg text-balance opacity-90">
            Showcase who you are beyond your resume and discover companies that
            work the way you want to work.
          </p>
          <div className="mt-6 text-sm opacity-75">
            {session ? (
              <span>
                Signed in as {session.user?.name}.{" "}
                <Link href="/api/auth/signout" className="underline">
                  Sign out
                </Link>
              </span>
            ) : (
              <Link href="/api/auth/signin" className="underline">
                Sign in
              </Link>
            )}
          </div>
        </section>

        {session && (
          <section className="bg-white py-12 text-gray-900">
            <ProfileExample />
          </section>
        )}
      </main>
    </HydrateClient>
  );
}
