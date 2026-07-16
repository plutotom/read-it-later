import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicArticleReader } from "~/app/_components/public-article-reader";
import { getSharedArticleByToken } from "~/server/shared-article";
import { type ArticleMetadata } from "~/types/article";

interface SharedArticlePageProps {
  params: Promise<{
    token: string;
  }>;
}

function getSharedDescription(excerpt: string | null, content: string): string {
  if (excerpt?.trim()) return excerpt.trim();

  const plainText = content
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (plainText.length <= 160) return plainText;
  return `${plainText.slice(0, 157)}...`;
}

export async function generateMetadata({
  params,
}: SharedArticlePageProps): Promise<Metadata> {
  const { token } = await params;
  const article = await getSharedArticleByToken(token);

  if (!article) {
    return {
      title: "Article not found",
      description:
        "This shared article may have been removed or the link is invalid.",
    };
  }

  const metadata = article.metadata as ArticleMetadata | null | undefined;
  const imageUrl = metadata?.imageUrl;
  const description = getSharedDescription(article.excerpt, article.content);

  return {
    title: article.title,
    description,
    openGraph: {
      title: article.title,
      description,
      type: "article",
      ...(imageUrl ? { images: [{ url: imageUrl }] } : {}),
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title: article.title,
      description,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
  };
}

export default async function SharedArticlePage({
  params,
}: SharedArticlePageProps) {
  const { token } = await params;
  const article = await getSharedArticleByToken(token);

  if (!article) {
    notFound();
  }

  return <PublicArticleReader article={article} shareToken={token} />;
}
