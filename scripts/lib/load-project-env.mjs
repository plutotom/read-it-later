import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
export function loadProjectEnv() {
  const supplied = { ...process.env };
  for (const file of [".env", ".env.local"]) {
    if (existsSync(file))
      Object.assign(
        process.env,
        parseEnv(readFileSync(file, "utf8")),
        supplied,
      );
  }
}
