import { useState } from "react";
import {
  Action,
  ActionPanel,
  Form,
  Icon,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { createArticle } from "./api";
import type { ArticleCreate } from "./types";
import { AuthErrorView, useAuth } from "./use-auth";

interface FormValues {
  url: string;
  title: string;
  content: string;
  tags: string;
}

export default function Command() {
  const { isValidating, authError } = useAuth();
  const { pop } = useNavigation();
  const [urlError, setUrlError] = useState<string | undefined>();

  if (authError) {
    return <AuthErrorView message={authError} />;
  }

  async function handleSubmit(values: FormValues) {
    const url = values.url.trim();
    const title = values.title.trim();
    const content = values.content.trim();

    // Need either a URL to import, or title + content for a manual entry.
    if (!url && !(title && content)) {
      setUrlError("Provide a URL, or a Title and Content for a manual entry.");
      return;
    }
    setUrlError(undefined);

    const body: ArticleCreate = {};
    if (url) body.url = url;
    if (title) body.title = title;
    if (content) body.content = content;
    const tags = values.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length > 0) body.tags = tags;

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Saving article…",
    });
    try {
      const article = await createArticle(body);
      toast.style = Toast.Style.Success;
      toast.title = "Saved to library";
      toast.message = article.title || article.url;
      pop();
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not save article";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  }

  return (
    <Form
      isLoading={isValidating}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            icon={Icon.PlusCircle}
            title="Add to Library"
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Paste a URL to import a page, or fill in Title + Content for a manual entry." />
      <Form.TextField
        id="url"
        title="URL"
        placeholder="https://example.com/article"
        error={urlError}
        onChange={() => urlError && setUrlError(undefined)}
      />
      <Form.Separator />
      <Form.TextField
        id="title"
        title="Title"
        placeholder="Optional — required for manual entry"
      />
      <Form.TextArea
        id="content"
        title="Content"
        placeholder="Optional — paste text for a manual entry"
      />
      <Form.TextField
        id="tags"
        title="Tags"
        placeholder="Comma-separated, e.g. reading, research"
      />
    </Form>
  );
}
