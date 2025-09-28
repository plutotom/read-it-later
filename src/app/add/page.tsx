"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { api } from "~/trpc/react";

function AddArticleContent() {
  const searchParams = useSearchParams();
  const [isProcessing, setIsProcessing] = useState(true);
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");

  const url = searchParams.get("url");
  const title = searchParams.get("title");

  const createArticle = api.article.create.useMutation({
    onSuccess: () => {
      setStatus("success");
      setMessage("Article saved successfully!");
      setIsProcessing(false);
    },
    onError: (error) => {
      setStatus("error");
      setMessage(`Error: ${error.message}`);
      setIsProcessing(false);
    },
  });

  useEffect(() => {
    if (url) {
      // Process the article
      createArticle.mutate({
        url: decodeURIComponent(url),
      });
    } else {
      setStatus("error");
      setMessage("Missing URL parameter");
      setIsProcessing(false);
    }
  }, [url, createArticle]);

  const handleClose = () => {
    window.close();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Read It Later</CardTitle>
          <CardDescription>
            {isProcessing ? "Processing article..." : "Article processed"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isProcessing && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          )}

          {status === "success" && (
            <div className="space-y-4 text-center">
              <CheckCircle className="mx-auto h-16 w-16 text-green-600" />
              <p className="font-medium text-green-700">{message}</p>
              <Button onClick={handleClose} className="w-full">
                Close
              </Button>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-4 text-center">
              <XCircle className="mx-auto h-16 w-16 text-red-600" />
              <p className="font-medium text-red-700">{message}</p>
              <Button
                onClick={handleClose}
                variant="outline"
                className="w-full"
              >
                Close
              </Button>
            </div>
          )}

          {url && (
            <div className="mt-4 rounded-lg bg-gray-100 p-3">
              <p className="text-sm text-gray-600">
                <strong>URL:</strong> {decodeURIComponent(url)}
              </p>
              {title && (
                <p className="mt-1 text-sm text-gray-600">
                  <strong>Title:</strong> {decodeURIComponent(title)}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AddArticlePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
          <Card className="w-full max-w-md">
            <CardContent className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </CardContent>
          </Card>
        </div>
      }
    >
      <AddArticleContent />
    </Suspense>
  );
}
