"use client";

import { useState, useEffect } from "react";
import { Copy, Check, Bookmark, Share } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

export function BookmarkletInstructions() {
  const [copied, setCopied] = useState(false);
  const [bookmarkletCode, setBookmarkletCode] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const code = `javascript:(function(){var url=encodeURIComponent(window.location.href);var title=encodeURIComponent(document.title);window.open('${window.location.origin}/add?url='+url+'&title='+title,'_blank');})();`;
      setBookmarkletCode(code);
    }
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(bookmarkletCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bookmark className="h-6 w-6 text-blue-600" />
          <CardTitle className="text-xl">iOS Bookmarklet Setup</CardTitle>
        </div>
        <CardDescription>
          Add this bookmarklet to Safari to quickly save articles to Read It
          Later
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-100 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                Bookmarklet Code:
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopy}
                className="h-8"
              >
                {copied ? (
                  <>
                    <Check className="mr-1 h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-4 w-4" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <code className="text-xs break-all text-gray-600">
              {bookmarkletCode}
            </code>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-gray-900">Setup Instructions:</h4>
            <ol className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-800">
                  1
                </span>
                <span>Copy the bookmarklet code above</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-800">
                  2
                </span>
                <span>Open Safari on your iPhone/iPad</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-800">
                  3
                </span>
                <span>Tap the Share button (square with arrow)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-800">
                  4
                </span>
                <span>Scroll down and tap "Add Bookmark"</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-800">
                  5
                </span>
                <span>Edit the bookmark and paste the code as the URL</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-800">
                  6
                </span>
                <span>Name it "Read It Later" and save</span>
              </li>
            </ol>
          </div>

          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-2">
              <Share className="mt-0.5 h-5 w-5 text-green-600" />
              <div>
                <h4 className="font-semibold text-green-800">How to Use:</h4>
                <p className="mt-1 text-sm text-green-700">
                  When you want to save an article, tap the "Read It Later"
                  bookmark in Safari. It will automatically open your PWA with
                  the article ready to be saved.
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
