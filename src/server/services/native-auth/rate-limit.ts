import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { env } from "~/env";
import { db } from "~/server/db";
import { verification } from "~/schemas/auth";

const PREFIX = "native-auth-rate:";

/** Atomic per-minute counters in the existing verification table, shared by instances. */
export async function allowAuthAttempt(subject: string, maximum: number) {
  const now = Date.now();
  const digest = createHmac("sha256", env.AUTH_SECRET)
    .update(subject)
    .digest("hex");
  const id = `${PREFIX}${Math.floor(now / 60_000)}:${digest}`;
  const [row] = await db
    .insert(verification)
    .values({
      id,
      identifier: PREFIX,
      value: "1",
      expiresAt: new Date(now + 120_000),
    })
    .onConflictDoUpdate({
      target: verification.id,
      set: { value: sql`(CAST(${verification.value} AS integer) + 1)::text` },
    })
    .returning({ value: verification.value });
  // Cleanup is bounded to this feature's expired counters, never auth tokens/user data.
  await db.execute(sql`delete from ${verification} where ${verification.id} in (
    select ${verification.id} from ${verification}
    where ${verification.identifier} = ${PREFIX} and ${verification.expiresAt} < ${new Date(now).toISOString()}::timestamp limit 50
  )`);
  return Number(row?.value ?? maximum + 1) <= maximum;
}

export async function passwordLoginLimit(
  request: Request,
): Promise<Response | null> {
  if (!new URL(request.url).pathname.endsWith("/sign-in/email")) return null;
  // Read a bounded clone. Better Auth still validates and processes the original request.
  const reader = request.clone().body?.getReader();
  if (!reader)
    return Response.json(
      { message: "Invalid sign-in request." },
      { status: 400 },
    );
  let input = "";
  const decoder = new TextDecoder();
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.length;
      if (bytes > 4096)
        return Response.json(
          { message: "Sign-in request is too large." },
          { status: 413 },
        );
      input += decoder.decode(next.value, { stream: true });
    }
    const body = JSON.parse(input + decoder.decode()) as { email?: unknown };
    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase().slice(0, 254)
        : "invalid";
    // Vercel supplies this header; other deployments share a conservative fallback bucket.
    const ip = process.env.VERCEL
      ? (request.headers.get("x-vercel-forwarded-for") ?? "unknown")
      : "local";
    if (
      !(await allowAuthAttempt(`email:${email}`, 5)) ||
      !(await allowAuthAttempt(`ip:${ip}`, 30))
    ) {
      return Response.json(
        { message: "Too many attempts. Wait a minute and try again." },
        {
          status: 429,
          headers: { "Retry-After": "60", "Cache-Control": "no-store" },
        },
      );
    }
    return null;
  } catch {
    // A missing/unavailable store must not silently turn throttling off.
    return Response.json(
      { message: "Sign-in is temporarily unavailable." },
      { status: 503 },
    );
  } finally {
    // Do not await cancellation of one branch of a tee; the original is still read by Better Auth.
    void reader.cancel().catch(() => undefined);
  }
}
