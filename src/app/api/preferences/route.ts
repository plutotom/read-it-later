import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { userPreferences } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { hasAccountPassword } from "~/server/services/native-auth/password-status";

function asSettingsRecord(settings: unknown): Record<string, unknown> {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return {};
  }
  return settings as Record<string, unknown>;
}

/** Missing or non-false values default to on so existing users keep PARA chrome. */
function resolveParaEnabled(settings: unknown): boolean {
  return asSettingsRecord(settings).paraEnabled !== false;
}

// GET /api/preferences - Load user preferences
export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [prefs, hasPassword] = await Promise.all([
    db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, session.user.id),
    }),
    hasAccountPassword(session.user.id),
  ]);

  if (!prefs) {
    return NextResponse.json(
      {
        theme: "light",
        ttsVoiceName: "en-US-Standard-A",
        settings: {},
        paraEnabled: true,
        hasPassword,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  return NextResponse.json(
    {
      theme: prefs.theme,
      ttsVoiceName: prefs.ttsVoiceName ?? "en-US-Standard-A",
      settings: prefs.settings,
      paraEnabled: resolveParaEnabled(prefs.settings),
      hasPassword,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
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
    ttsVoiceName?: string;
    settings?: Record<string, unknown>;
    paraEnabled?: boolean;
  };

  const existingPrefs = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, session.user.id),
  });

  const existingSettings = asSettingsRecord(existingPrefs?.settings);
  const paraEnabledUpdate =
    typeof body.paraEnabled === "boolean" ? body.paraEnabled : undefined;
  const shouldUpdateSettings =
    body.settings !== undefined || paraEnabledUpdate !== undefined;
  const nextSettings = shouldUpdateSettings
    ? {
        ...existingSettings,
        ...(body.settings ?? {}),
        ...(paraEnabledUpdate !== undefined
          ? { paraEnabled: paraEnabledUpdate }
          : {}),
      }
    : undefined;

  if (existingPrefs) {
    // Update existing preferences
    await db
      .update(userPreferences)
      .set({
        ...(body.theme && { theme: body.theme }),
        ...(body.ttsVoiceName && { ttsVoiceName: body.ttsVoiceName }),
        ...(nextSettings && { settings: nextSettings }),
      })
      .where(eq(userPreferences.userId, session.user.id));
  } else {
    // Create new preferences
    await db.insert(userPreferences).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      theme: body.theme ?? "light",
      ttsVoiceName: body.ttsVoiceName ?? "en-US-Standard-A",
      settings: nextSettings ?? {},
    });
  }

  return NextResponse.json({ success: true });
}
