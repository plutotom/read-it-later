"use client";

import { useState, useEffect } from "react";
import { X, Download, Share } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if running on iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    // Check if already installed (standalone mode)
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    // Listen for beforeinstallprompt event (Android/Chrome)
    const handleBeforeInstallPrompt = (e: Event) => {
      console.log("beforeinstallprompt event fired");
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstallPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Debug: Check if the event is supported
    console.log(
      "beforeinstallprompt supported:",
      "onbeforeinstallprompt" in window,
    );

    // For non-iOS devices, show if user hasn't dismissed and not standalone
    const dismissed = localStorage.getItem("install-prompt-dismissed");
    if (!dismissed && !standalone && !iOS) {
      // Show the install prompt for non-iOS devices
      setShowInstallPrompt(true);
    }

    // Debug: Log current state
    console.log("Install prompt state:", {
      isIOS,
      isStandalone,
      dismissed: !!dismissed,
      showInstallPrompt,
      deferredPrompt: !!deferredPrompt,
    });

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        // Android/Chrome install
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
          setShowInstallPrompt(false);
        }
        setDeferredPrompt(null);
      } catch (error) {
        console.error("Error during install prompt:", error);
        // If install fails, just dismiss the prompt
        setShowInstallPrompt(false);
        setDeferredPrompt(null);
      }
    } else {
      // Fallback: try to trigger install via browser menu
      console.log(
        "No deferred prompt available. Please use browser menu to install.",
      );
      setShowInstallPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowInstallPrompt(false);
    localStorage.setItem("install-prompt-dismissed", "true");
  };

  // Don't show if already installed or if user dismissed
  if (isStandalone || !showInstallPrompt) {
    return null;
  }

  // For non-iOS, only show if we have a deferred prompt
  // But for testing, let's show it anyway with instructions
  if (!isIOS && !deferredPrompt) {
    // Show fallback instructions for testing
    return (
      <div className="fixed right-4 bottom-4 left-4 z-50 md:right-4 md:left-auto md:max-w-sm">
        <Card className="border-orange-200 bg-orange-50 shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Download className="h-5 w-5 text-orange-600" />
                <CardTitle className="text-lg text-orange-900">
                  Install App
                </CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="h-8 w-8 p-0 text-orange-600 hover:bg-orange-100"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <CardDescription className="text-orange-700">
              Install Read It Later for a better experience
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              <div className="text-xs text-orange-600">
                <p>
                  <strong>To install this app:</strong>
                </p>
                <p>1. Click the three dots menu (⋮) in Chrome</p>
                <p>2. Select "Install Read It Later"</p>
                <p className="mt-2 text-orange-500">
                  Or wait for the automatic install prompt to appear
                </p>
              </div>
              <Button
                onClick={handleDismiss}
                className="w-full bg-orange-600 hover:bg-orange-700"
              >
                Got it!
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed right-4 bottom-4 left-4 z-50 md:right-4 md:left-auto md:max-w-sm">
      <Card className="border-blue-200 bg-blue-50 shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg text-blue-900">
                Install App
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-100"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription className="text-blue-700">
            {isIOS
              ? "Add Read It Later to your home screen for quick access"
              : "Install Read It Later for a better experience"}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {isIOS ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-blue-700">
                <Share className="h-4 w-4" />
                <span>Tap the Share button below</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-blue-700">
                <Download className="h-4 w-4" />
                <span>Select "Add to Home Screen"</span>
              </div>
              <Button
                onClick={handleDismiss}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Got it!
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Button
                onClick={handleInstallClick}
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={!deferredPrompt}
              >
                <Download className="mr-2 h-4 w-4" />
                {deferredPrompt ? "Install Now" : "Install Not Available"}
              </Button>
              {!deferredPrompt && (
                <div className="text-xs text-blue-600">
                  <p>To install this app:</p>
                  <p>1. Click the three dots menu (⋮) in Chrome</p>
                  <p>2. Select "Install Read It Later"</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
