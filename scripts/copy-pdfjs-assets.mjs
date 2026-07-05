import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(rootDir, "public", "pdfjs");

const pdfjsDistPath = path.dirname(
  require.resolve("pdfjs-dist/package.json", {
    paths: [require.resolve("react-pdf")],
  }),
);

mkdirSync(outputDir, { recursive: true });

const copies = [
  {
    from: path.join(pdfjsDistPath, "build", "pdf.worker.min.mjs"),
    to: path.join(outputDir, "pdf.worker.min.mjs"),
  },
  {
    from: path.join(pdfjsDistPath, "wasm"),
    to: path.join(outputDir, "wasm"),
  },
  {
    from: path.join(pdfjsDistPath, "cmaps"),
    to: path.join(outputDir, "cmaps"),
  },
  {
    from: path.join(pdfjsDistPath, "standard_fonts"),
    to: path.join(outputDir, "standard_fonts"),
  },
];

for (const { from, to } of copies) {
  cpSync(from, to, { recursive: true });
}

console.log(`Copied pdfjs assets from ${pdfjsDistPath} to ${outputDir}`);
