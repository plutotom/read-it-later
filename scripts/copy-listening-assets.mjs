import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
mkdirSync("public/listening", { recursive: true });
copyFileSync(
  require.resolve("@soundtouchjs/audio-worklet/processor"),
  "public/listening/soundtouch-processor.js",
);
