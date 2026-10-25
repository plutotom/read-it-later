"use client";

import { useState, useEffect } from "react";
import { useSession } from "~/lib/auth-client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import {
  Moon,
  Sun,
  Loader2,
  Volume2,
  HardDrive,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { DEFAULT_VOICE } from "~/lib/tts-voices";
import { TTSUsageDisplay } from "~/app/_components/tts-usage-display";
import { VoiceSelector } from "~/app/_components/voice-selector";
import { ApiKeysSettings } from "~/app/_components/api-keys-settings";
import { Layout } from "~/app/_components/layout";

export default function PreferencesPage() {
  const { data: session } = useSession();
  const userId = session?.user.id;
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [ttsVoiceName, setTtsVoiceName] = useState(DEFAULT_VOICE);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [passwordStatus, setPasswordStatus] = useState<{
    userId: string;
    hasPassword: boolean;
  } | null>(null);
  const hasPassword =
    passwordStatus?.userId === userId ? passwordStatus?.hasPassword : undefined;

  // Load preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const response = await fetch("/api/preferences");
        if (response.ok) {
          const data = (await response.json()) as {
            theme?: "light" | "dark";
            ttsVoiceName?: string;
            hasPassword?: boolean;
          };
          if (data.theme) {
            setTheme(data.theme);
          }
          if (data.ttsVoiceName) {
            setTtsVoiceName(data.ttsVoiceName);
          }
          if (userId && typeof data.hasPassword === "boolean") {
            setPasswordStatus({
              userId,
              hasPassword: data.hasPassword,
            });
          }
        }
      } catch (error) {
        console.error("Failed to load preferences:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (userId) {
      void loadPreferences();
    } else {
      setIsLoading(false);
    }
  }, [userId]);

  const handleThemeChange = async (isDark: boolean) => {
    const newTheme = isDark ? "dark" : "light";
    setTheme(newTheme);
    setIsSaving(true);

    try {
      await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: newTheme }),
      });
    } catch (error) {
      console.error("Failed to save preferences:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleVoiceChange = async (newVoice: string) => {
    setTtsVoiceName(newVoice);
    setIsSavingVoice(true);

    try {
      await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttsVoiceName: newVoice }),
      });
    } catch (error) {
      console.error("Failed to save voice preference:", error);
    } finally {
      setIsSavingVoice(false);
    }
  };

  if (isLoading) {
    return (
      <Layout pageTitle="Preferences">
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout pageTitle="Preferences">
      <div className="container mx-auto max-w-2xl p-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Preferences</h1>
          <p className="text-gray-400">
            Manage your account settings and preferences.
          </p>
        </div>

        <Card className="bg-card border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">Appearance</CardTitle>
            <CardDescription>
              Customize how the app looks and feels.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {theme === "dark" ? (
                  <Moon className="h-5 w-5 text-gray-400" />
                ) : (
                  <Sun className="h-5 w-5 text-yellow-400" />
                )}
                <div>
                  <Label htmlFor="theme-toggle" className="text-white">
                    Dark Mode
                  </Label>
                  <p className="text-sm text-gray-400">
                    Use dark theme for the interface
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isSaving && (
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                )}
                <Switch
                  id="theme-toggle"
                  checked={theme === "dark"}
                  onCheckedChange={handleThemeChange}
                  disabled={isSaving}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Text-to-Speech Settings */}
        <Card className="bg-card mt-6 border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Volume2 className="h-5 w-5" />
              Text-to-Speech
            </CardTitle>
            <CardDescription>
              Configure your preferred voice for article audio.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Voice Selection */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <Label htmlFor="voice-select" className="text-white">
                  Voice
                </Label>
                <p className="text-sm text-gray-400">
                  Choose the voice for reading articles aloud
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isSavingVoice && (
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                )}
                <VoiceSelector
                  value={ttsVoiceName}
                  onValueChange={handleVoiceChange}
                  disabled={isSavingVoice}
                />
              </div>
            </div>

            {/* TTS Usage Display */}
            <div className="border-t border-gray-700 pt-4">
              <TTSUsageDisplay />
            </div>
          </CardContent>
        </Card>

        <Link
          href="/preferences/storage"
          className="border-rule bg-surface hover:bg-background-deep text-foreground mt-6 flex min-h-20 items-center gap-4 rounded-xl border px-6 py-5 transition-colors"
        >
          <HardDrive className="text-muted-foreground size-5 shrink-0" />
          <div className="flex-1">
            <h2 className="font-medium">Manage storage</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Cache limits, local audio, and downloads.
            </p>
          </div>
          <ChevronRight className="text-muted-foreground size-4" />
        </Link>

        <ApiKeysSettings />

        <Card className="bg-card mt-6 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">Account</CardTitle>
            <CardDescription>Your account information.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-white">Sign-in password</Label>
              <p className="text-sm text-gray-400">
                {hasPassword === true
                  ? "Password is set. You can sign in to Paper Drive."
                  : hasPassword === false
                    ? "No password set. Add one to sign in to Paper Drive."
                    : "Could not check password status."}
              </p>
              <Link
                href="/native/password"
                className="text-primary underline underline-offset-4"
              >
                {hasPassword === true
                  ? "Change password"
                  : hasPassword === false
                    ? "Set up password"
                    : "Manage password"}
              </Link>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-white">Email</Label>
                <p className="text-sm text-gray-400">{session?.user?.email}</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-white">Name</Label>
                <p className="text-sm text-gray-400">
                  {session?.user?.name ?? "Not set"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
