import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { userPreferences } from "~/server/db/schema";
import { eq } from "drizzle-orm";

// GET /api/preferences - Load user preferences
export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prefs = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, session.user.id),
  });

  if (!prefs) {
    return NextResponse.json({ theme: "light", settings: {} });
  }

  return NextResponse.json({
    theme: prefs.theme,
    settings: prefs.settings,
  });
}

// POST /api/preferences - Save user preferences
export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    theme?: "light" | "dark";
    settings?: Record<string, unknown>;
  };

  const existingPrefs = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, session.user.id),
  });

  if (existingPrefs) {
    // Update existing preferences
    await db
      .update(userPreferences)
      .set({
        ...(body.theme && { theme: body.theme }),
        ...(body.settings && { settings: body.settings }),
      })
      .where(eq(userPreferences.userId, session.user.id));
  } else {
    // Create new preferences
    await db.insert(userPreferences).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      theme: body.theme ?? "light",
      settings: body.settings ?? {},
    });
  }

  return NextResponse.json({ success: true });
}
