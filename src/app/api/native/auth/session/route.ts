import { auth } from "~/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = {
    "Cache-Control": "private, no-store",
    Vary: "Authorization, Cookie",
  };
  if (!request.headers.get("authorization")?.startsWith("Bearer "))
    return Response.json({ code: "unauthorized" }, { status: 401, headers });
  const credentials = new Headers(request.headers);
  credentials.delete("cookie");
  let session;
  try {
    session = await auth.api.getSession({
      headers: credentials,
      query: { disableCookieCache: true },
    });
  } catch {
    return Response.json(
      { code: "service_unavailable" },
      { status: 503, headers },
    );
  }
  if (!session)
    return Response.json({ code: "unauthorized" }, { status: 401, headers });
  return Response.json(
    {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
      },
      expiresAt: session.session.expiresAt.toISOString(),
    },
    { headers },
  );
}
