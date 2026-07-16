import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { THEME_COOKIE_KEY, resolveTheme, type ThemeName } from "~/lib/theme";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let theme: ThemeName;
  try {
    const body = (await request.json()) as { theme?: string };
    theme = resolveTheme(body.theme);
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE_KEY, theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.json({ theme });
}
