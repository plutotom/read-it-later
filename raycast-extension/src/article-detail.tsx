import { Action, ActionPanel, Detail, Icon } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { getArticleContent } from "./api";
import type { Article } from "./types";

function formatReadingTime(article: Article): string | undefined {
  if (article.readingTime) return `${article.readingTime} min read`;
  if (article.wordCount) return `${article.wordCount.toLocaleString()} words`;
  return undefined;
}

export function ArticleDetail({ article }: { article: Article }) {
  const { data: content, isLoading } = usePromise(getArticleContent, [article.id, "text"], {
    failureToastOptions: { title: "Could not load article content" },
  });

  const body = content?.trim() ? content : "_No content available._";
  const markdown = `# ${article.title}\n\n${body}`;

  const readingTime = formatReadingTime(article);

  return (
    <Detail
      isLoading={isLoading}
      navigationTitle={article.title}
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          {article.author ? <Detail.Metadata.Label title="Author" text={article.author} /> : null}
          {readingTime ? <Detail.Metadata.Label title="Length" text={readingTime} /> : null}
          <Detail.Metadata.Label
            title="Status"
            text={article.isArchived ? "Archived" : article.isRead ? "Read" : "Unread"}
            icon={article.isFavorite ? Icon.Star : undefined}
          />
          {article.tags && article.tags.length > 0 ? (
            <Detail.Metadata.TagList title="Tags">
              {article.tags.map((tag) => (
                <Detail.Metadata.TagList.Item key={tag} text={tag} />
              ))}
            </Detail.Metadata.TagList>
          ) : null}
          <Detail.Metadata.Separator />
          <Detail.Metadata.Link title="Original" target={article.url} text={article.url} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.OpenInBrowser url={article.url} title="Open Original URL" />
          <Action.CopyToClipboard content={article.url} title="Copy URL" />
        </ActionPanel>
      }
    />
  );
}
