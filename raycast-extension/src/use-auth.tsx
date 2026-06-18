import { Action, ActionPanel, Detail, openExtensionPreferences } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { getMe, ApiError } from "./api";

interface Auth {
  isValidating: boolean;
  /** A user-facing error message when the key is invalid/unauthorized, else undefined. */
  authError?: string;
}

/** Validates the API key on launch via /me. */
export function useAuth(): Auth {
  const { isLoading, error } = usePromise(getMe, [], {
    failureToastOptions: { title: "Could not validate API key" },
  });

  let authError: string | undefined;
  if (error) {
    authError = error instanceof ApiError ? error.message : "Could not reach the read-it-later API. Check your connection.";
  }

  return { isValidating: isLoading, authError };
}

/** Full-screen error view with a shortcut to fix the API key. */
export function AuthErrorView({ message }: { message: string }) {
  return (
    <Detail
      markdown={`# 🔒 Authentication Error\n\n${message}`}
      actions={
        <ActionPanel>
          <Action title="Open Extension Preferences" onAction={openExtensionPreferences} />
        </ActionPanel>
      }
    />
  );
}
