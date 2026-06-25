import { useState } from "react";
import {
  Action,
  ActionPanel,
  Alert,
  Clipboard,
  Color,
  confirmAlert,
  Icon,
  Keyboard,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import { useFetch } from "@raycast/utils";
import {
  API_BASE,
  addToPara,
  authHeaders,
  deleteArticle,
  parseJsonResponse,
  removeFromParaByArticleId,
  shareArticle,
  updateArticle,
} from "./api";
import type { Article, ArticleList, ArticleUpdate, ParaExport } from "./types";
import { ArticleDetail } from "./article-detail";
import { AuthErrorView, useAuth } from "./use-auth";

const PAGE_SIZE = 25;

export default function Command() {
  const { isValidating, authError } = useAuth();
  const [searchText, setSearchText] = useState("");

  const { isLoading, data, pagination, revalidate } = useFetch(
    (options: { page: number; cursor?: string }) => {
      const trimmed = searchText.trim();
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (trimmed) params.set("q", trimmed);
      if (options.cursor) params.set("cursor", options.cursor);
      // /search when there's a query, otherwise the full /articles list.
      return `${API_BASE}${trimmed ? "/search" : "/articles"}?${params.toString()}`;
    },
    {
      headers: authHeaders(),
      parseResponse: parseJsonResponse<ArticleList>,
      mapResult(result) {
        return {
          data: result.data,
          hasMore: Boolean(result.nextCursor),
          cursor: result.nextCursor ?? undefined,
        };
      },
      keepPreviousData: true,
      initialData: [],
      execute: !authError && !isValidating,
      failureToastOptions: { title: "Could not load library" },
    },
  );

  const {
    data: paraExports = [],
    isLoading: isParaLoading,
    revalidate: revalidatePara,
  } = useFetch(`${API_BASE}/para/exports`, {
    headers: authHeaders(),
    parseResponse: parseJsonResponse<ParaExport[]>,
    initialData: [],
    execute: !authError && !isValidating,
    failureToastOptions: { title: "Could not load Para list" },
  });

  const paraArticleIds = new Set(
    paraExports.map((row) => row.articleId).filter((id): id is string => Boolean(id)),
  );

  const refreshAll = () => {
    revalidate();
    revalidatePara();
  };

  if (authError) {
    return <AuthErrorView message={authError} />;
  }

  const articles = data ?? [];

  return (
    <List
      isLoading={isValidating || isLoading || isParaLoading}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      throttle
      pagination={pagination}
      searchBarPlaceholder="Search your library…"
    >
      <List.EmptyView
        icon={Icon.Bookmark}
        title={searchText.trim() ? "No matching articles" : "Your library is empty"}
        description={searchText.trim() ? "Try a different search." : "Add an article with the Add to Library command."}
      />
      {articles.map((article) => (
        <ArticleItem
          key={article.id}
          article={article}
          isOnPara={paraArticleIds.has(article.id)}
          revalidate={refreshAll}
        />
      ))}
    </List>
  );
}

function ArticleItem({
  article,
  isOnPara,
  revalidate,
}: {
  article: Article;
  isOnPara: boolean;
  revalidate: () => void;
}) {
  const accessories: List.Item.Accessory[] = [];

  if (isOnPara) {
    accessories.push({ icon: { source: Icon.Tablet, tintColor: Color.Green }, tooltip: "On Para list" });
  }
  if (article.isFavorite) {
    accessories.push({ icon: { source: Icon.Star, tintColor: Color.Yellow }, tooltip: "Favorite" });
  }
  if (article.isArchived) {
    accessories.push({ icon: { source: Icon.Tray, tintColor: Color.SecondaryText }, tooltip: "Archived" });
  }
  if (article.tags && article.tags.length > 0) {
    accessories.push({ tag: article.tags[0] });
  }
  if (article.readingTime) {
    accessories.push({ text: `${article.readingTime} min` });
  }

  return (
    <List.Item
      icon={article.isRead ? Icon.CheckCircle : Icon.Circle}
      title={article.title || article.url}
      subtitle={article.excerpt ?? undefined}
      accessories={accessories}
      keywords={article.tags ?? undefined}
      actions={<ArticleActions article={article} isOnPara={isOnPara} revalidate={revalidate} />}
    />
  );
}

function ArticleActions({
  article,
  isOnPara,
  revalidate,
}: {
  article: Article;
  isOnPara: boolean;
  revalidate: () => void;
}) {
  async function patch(update: ArticleUpdate, label: string) {
    const toast = await showToast({ style: Toast.Style.Animated, title: `${label}…` });
    try {
      await updateArticle(article.id, update);
      toast.style = Toast.Style.Success;
      toast.title = `${label} done`;
      revalidate();
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = label + " failed";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  }

  async function copyShareLink() {
    const toast = await showToast({ style: Toast.Style.Animated, title: "Creating share link…" });
    try {
      const { shareUrl } = await shareArticle(article.id);
      await Clipboard.copy(shareUrl);
      toast.style = Toast.Style.Success;
      toast.title = "Share link copied";
      toast.message = shareUrl;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not create share link";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  }

  async function destroy() {
    const confirmed = await confirmAlert({
      title: "Delete Article",
      message: `“${article.title}” will be permanently removed.`,
      icon: Icon.Trash,
      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;

    const toast = await showToast({ style: Toast.Style.Animated, title: "Deleting…" });
    try {
      await deleteArticle(article.id);
      toast.style = Toast.Style.Success;
      toast.title = "Deleted";
      revalidate();
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Delete failed";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  }

  async function togglePara() {
    const label = isOnPara ? "Removing from Para" : "Adding to Para";
    const toast = await showToast({ style: Toast.Style.Animated, title: `${label}…` });
    try {
      if (isOnPara) {
        await removeFromParaByArticleId(article.id);
        toast.style = Toast.Style.Success;
        toast.title = "Removed from Para";
        toast.message = "Your device will delete this on the next sync.";
      } else {
        await addToPara({ articleId: article.id });
        toast.style = Toast.Style.Success;
        toast.title = "Added to Para";
        toast.message = "Syncs to your e-reader on the next sync.";
      }
      revalidate();
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = isOnPara ? "Could not remove from Para" : "Could not add to Para";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  }

  return (
    <ActionPanel>
      <ActionPanel.Section>
        <Action.OpenInBrowser url={article.url} title="Open Original URL" />
        <Action.Push
          icon={Icon.Text}
          title="View Content"
          target={<ArticleDetail article={article} />}
          shortcut={{ modifiers: ["cmd"], key: "enter" }}
        />
        <Action
          icon={Icon.Link}
          title="Copy Share Link"
          onAction={copyShareLink}
          shortcut={{ modifiers: ["cmd"], key: "." }}
        />
        <Action.CopyToClipboard
          title="Copy URL"
          content={article.url}
          shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
        />
      </ActionPanel.Section>

      <ActionPanel.Section>
        <Action
          icon={Icon.Tablet}
          title={isOnPara ? "Remove from Para" : "Add to Para"}
          onAction={togglePara}
          shortcut={{ modifiers: ["cmd"], key: "p" }}
        />
        <Action
          icon={article.isFavorite ? Icon.StarDisabled : Icon.Star}
          title={article.isFavorite ? "Remove Favorite" : "Add Favorite"}
          onAction={() =>
            patch({ isFavorite: !article.isFavorite }, article.isFavorite ? "Unfavoriting" : "Favoriting")
          }
          shortcut={{ modifiers: ["cmd"], key: "f" }}
        />
        <Action
          icon={article.isRead ? Icon.Circle : Icon.CheckCircle}
          title={article.isRead ? "Mark as Unread" : "Mark as Read"}
          onAction={() => patch({ isRead: !article.isRead }, article.isRead ? "Marking unread" : "Marking read")}
          shortcut={{ modifiers: ["cmd"], key: "r" }}
        />
        <Action
          icon={article.isArchived ? Icon.Tray : Icon.Box}
          title={article.isArchived ? "Unarchive" : "Archive"}
          onAction={() =>
            patch({ isArchived: !article.isArchived }, article.isArchived ? "Unarchiving" : "Archiving")
          }
          shortcut={{ modifiers: ["cmd"], key: "e" }}
        />
      </ActionPanel.Section>

      <ActionPanel.Section>
        <Action
          icon={Icon.ArrowClockwise}
          title="Refresh"
          onAction={revalidate}
          shortcut={Keyboard.Shortcut.Common.Refresh}
        />
        <Action
          icon={Icon.Trash}
          title="Delete Article"
          style={Action.Style.Destructive}
          onAction={destroy}
          shortcut={Keyboard.Shortcut.Common.Remove}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );
}
