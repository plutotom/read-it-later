"use client";

import React, { use } from "react";
import { api } from "~/trpc/react";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { PublicArticleReader } from "~/app/_components/public-article-reader";

interface SharedArticlePageProps {
  params: Promise<{
    token: string;
  }>;
}

export default function SharedArticlePage({ params }: SharedArticlePageProps) {
  const { token } = use(params);

  const {
    data: article,
    isLoading,
    error,
  } = api.article.getByShareToken.useQuery({ token }, { enabled: !!token });

  if (isLoading) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-lg text-gray-300">Loading article...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>
            Error loading article: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-gray-100">
            Article Not Found
          </h1>
          <p className="text-gray-400">
            This shared article may have been removed or the link is invalid.
          </p>
        </div>
      </div>
    );
  }

  return <PublicArticleReader article={article} shareToken={token} />;
}
