import { afterEach, expect, it, vi } from "vitest";
import { ArticleExtractor } from "./articleExtractor";

afterEach(() => vi.unstubAllGlobals());
it("extracts publisher HTML with scripts inert and without fetching external resources", async () => {
  const html =
    '<html><title>Safe fixture</title><body><article><h1>Safe fixture</h1><script>document.title="EXECUTED SCRIPT";document.body.innerHTML=""</script><img src="https://resources.example.com/image"><p>' +
    "A meaningful article sentence remains available for reading. ".repeat(80) +
    "</p></article></body></html>";
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(html, { headers: { "content-type": "text/html" } }),
    );
  vi.stubGlobal("fetch", fetcher);
  const result = await ArticleExtractor.extractFromUrl(
    "https://example.com/safe-fixture",
  );
  expect(result.title).not.toContain("EXECUTED");
  expect(result.content).toContain("meaningful article sentence");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
