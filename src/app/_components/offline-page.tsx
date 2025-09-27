"use client";

import { WifiOff, BookOpen, RefreshCw } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

export function OfflinePage() {
  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100">
            <WifiOff className="h-8 w-8 text-orange-600" />
          </div>
          <CardTitle className="text-xl text-gray-900">
            You're Offline
          </CardTitle>
          <CardDescription className="text-gray-600">
            It looks like you're not connected to the internet. Don't worry, you
            can still read your saved articles!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <BookOpen className="h-4 w-4" />
            <span>Your saved articles are still available</span>
          </div>
          <Button onClick={handleRefresh} className="w-full" variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
          <p className="text-xs text-gray-400">
            Check your internet connection and try refreshing the page
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
