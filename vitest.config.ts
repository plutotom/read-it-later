import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // Match Next.js's JSX runtime when exercising real React components.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    env: {
      DATABASE_URL: "postgres://localhost:5432/test",
      SKIP_ENV_VALIDATION: "true",
    },
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
    },
  },
});
