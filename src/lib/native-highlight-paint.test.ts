// @vitest-environment jsdom
import { expect, it } from "vitest";
import { hashAnchorText } from "./highlight-anchor";
import { resolvePaintableHighlight } from "./native-highlight-paint";
const fixture = () => {
  const root = document.createElement("article");
  root.innerHTML = "<p>A saved quote.</p><p>A saved quote.</p>";
  return root;
};
it("keeps native and unknown selectors unresolved without a verified DOM projection", () => {
  const root = fixture();
  const native = {
    text: "saved quote",
    startOffset: 2,
    endOffset: 13,
    anchorSpace: "local-text-v1",
    anchorContentHash: "original-native-sha256",
  };
  expect(resolvePaintableHighlight(root, native).status).toBe("lost");
  expect(
    resolvePaintableHighlight(root, { ...native, anchorSpace: "future-v9" })
      .status,
  ).toBe("lost");
});
it("paints a verified projection without relocation and refuses to search after a content change", () => {
  const root = fixture(),
    text = root.textContent;
  const source = {
    text: "saved quote",
    startOffset: 2,
    endOffset: 13,
    anchorSpace: "paper-drive-text-v1",
    webAnchor: {
      text: "saved quote",
      startOffset: 2,
      endOffset: 13,
      contentHash: hashAnchorText(text),
    },
  };
  const resolved = resolvePaintableHighlight(root, source);
  expect(resolved.status).toBe("anchored");
  if (resolved.status === "anchored") {
    expect(resolved.range.toString()).toBe("saved quote");
    expect(resolved.relocated).toBe(false);
  }
  root.appendChild(document.createTextNode(" Content changed."));
  expect(resolvePaintableHighlight(root, source).status).toBe("lost");
});
it("retains ordinary legacy web anchor behavior", () => {
  const root = fixture();
  expect(
    resolvePaintableHighlight(root, {
      text: "saved quote",
      startOffset: 2,
      endOffset: 13,
      anchorSpace: "web-dom-v1",
      anchorContentHash: hashAnchorText(root.textContent),
    }).status,
  ).toBe("anchored");
});
