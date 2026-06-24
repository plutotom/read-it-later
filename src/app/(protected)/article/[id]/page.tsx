import { Suspense } from "react";
import { ArticleDetailView } from "~/app/_components/article-detail-view";
import { api, HydrateClient } from "~/trpc/server";

interface ArticleDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ArticleDetailPage({
  params,
}: ArticleDetailPageProps) {
  const { id } = await params;

  await Promise.all([
    api.article.get.prefetch({ id }),
    api.annotation.getNotesByArticleId.prefetch({ articleId: id }),
  ]);

  return (
    <HydrateClient>
      <Suspense>
        <ArticleDetailView id={id} />
      </Suspense>
    </HydrateClient>
  );
}
