"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });

        console.log(
          "Service Worker registered successfully:",
          registration.scope,
        );

        // Check for updates
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (
                newWorker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                console.log("New service worker available");
                // Optionally notify user to refresh
              }
            });
          }
        });
      } catch (error) {
        console.error("Service Worker registration failed:", error);
      }
    };

    // Register immediately if page is already loaded
    if (document.readyState === "complete") {
      void registerServiceWorker();
    } else {
      // Otherwise wait for page load
      window.addEventListener("load", () => {
        void registerServiceWorker();
      });
    }
  }, []);

  return null;
}
