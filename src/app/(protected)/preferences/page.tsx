"use client";

import { useState, useEffect } from "react";
import { useSession } from "~/lib/auth-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { Moon, Sun, Loader2 } from "lucide-react";

export default function PreferencesPage() {
  const { data: session } = useSession();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const response = await fetch("/api/preferences");
        if (response.ok) {
          const data = await response.json() as { theme?: "light" | "dark" };
          if (data.theme) {
            setTheme(data.theme);
          }
        }
      } catch (error) {
        console.error("Failed to load preferences:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (session?.user) {
      void loadPreferences();
    } else {
      setIsLoading(false);
    }
  }, [session?.user]);

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

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Preferences</h1>
        <p className="text-gray-400">Manage your account settings and preferences.</p>
      </div>

      <Card className="border-gray-700 bg-card">
        <CardHeader>
          <CardTitle className="text-white">Appearance</CardTitle>
          <CardDescription>Customize how the app looks and feels.</CardDescription>
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
              {isSaving && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
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

      <Card className="mt-6 border-gray-700 bg-card">
        <CardHeader>
          <CardTitle className="text-white">Account</CardTitle>
          <CardDescription>Your account information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-white">Email</Label>
              <p className="text-sm text-gray-400">{session?.user?.email}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-white">Name</Label>
              <p className="text-sm text-gray-400">{session?.user?.name ?? "Not set"}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
