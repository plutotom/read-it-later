/** Resolve callbacks independently of schema defaults, which CI can bypass. */
export function resolveAuthBaseURL(config: {
  authURL?: string;
  vercelURL?: string;
  vercelEnvironment?: string;
}): string {
  // A legacy shared AUTH_URL must never capture preview callbacks.
  if (config.vercelEnvironment === "preview" && config.vercelURL)
    return `https://${config.vercelURL}`;
  if (config.authURL) return config.authURL;
  if (config.vercelURL) return `https://${config.vercelURL}`;
  return "http://localhost:4114";
}
