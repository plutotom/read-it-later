type AuthFetchError = {
  status?: number;
  statusText?: string;
  message?: string;
  code?: string;
};

function isAuthFetchError(error: unknown): error is AuthFetchError {
  return (
    typeof error === "object" &&
    error !== null &&
    ("status" in error || "message" in error || "code" in error)
  );
}

function getErrorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (isAuthFetchError(error) && typeof error.message === "string") {
    return error.message;
  }
  if (isAuthFetchError(error) && typeof error.code === "string") {
    return error.code;
  }
  return "";
}

export function getSignInErrorMessage(error: unknown): string {
  const text = getErrorText(error).toLowerCase();
  const status = isAuthFetchError(error) ? error.status : undefined;

  if (
    (status !== undefined && status >= 500) ||
    text.includes("connect_timeout") ||
    text.includes("timeout") ||
    text.includes("econnrefused") ||
    text.includes("fetch failed") ||
    text.includes("network") ||
    text.includes("server_error")
  ) {
    return "We couldn't reach our servers right now. Your account is fine — please wait a moment and try again.";
  }

  if (status === 429) {
    return "Too many sign-in attempts. Please wait a minute and try again.";
  }

  if (status === 503) {
    return "Sign-in is temporarily unavailable. Please try again shortly.";
  }

  return "Sign-in didn't work. Please try again.";
}

export function getOAuthCallbackErrorMessage(
  searchParams: URLSearchParams,
): string | null {
  const error = searchParams.get("error");
  if (!error) return null;

  switch (error) {
    case "access_denied":
      return "Sign-in was cancelled. You can try again when you're ready.";
    case "server_error":
      return "Discord had a problem completing sign-in. Please try again.";
    default: {
      const description = searchParams.get("error_description");
      return description
        ? `Sign-in failed: ${description}`
        : getSignInErrorMessage({ message: error });
    }
  }
}
