import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { createListeningDocument } from "~/lib/listening/document";
import {
  createNativeLibraryDocument,
  nativeLibraryDocumentFromHtml,
  nativeLibraryTextToHtml,
} from "./native-library-document";

describe("native canonical document shares the listening parser", () => {
  it("hashes exact UTF-8 without normalizing Unicode and maps UTF-16 source offsets", () => {
    const dom = new JSDOM(
      "<body><p>  e\u0301 <b>😀</b>  café </p><script>omitted</script><p hidden>secret fixture</p><p>終わり<br>next</p></body>",
    );
    try {
      const body = dom.window.document.body;
      const document = createNativeLibraryDocument(body);
      expect(document.text).toBe("e\u0301 😀 café\n\n終わり next");
      expect(document.text).not.toBe(document.text.normalize("NFC"));
      expect(document.contentHash).toBe(
        createHash("sha256").update(document.text, "utf8").digest("hex"),
      );
      expect(document.sourceOffsets).toHaveLength(document.text.length);
      expect(document.sourceOffsets.slice(10, 12)).toEqual([-1, -1]);
      const emoji = document.text.indexOf("😀");
      const emojiSource = document.sourceOffsets[emoji];
      if (emojiSource === undefined) throw new Error("Missing emoji offset");
      expect(body.textContent.slice(emojiSource, emojiSource + 2)).toBe("😀");
      expect(document.sourceOffsets[emoji + 1]).toBe(emojiSource + 1);
      for (const [index, character] of document.text.split("").entries()) {
        const source = document.sourceOffsets[index] ?? -1;
        if (source >= 0 && character !== " ")
          expect(body.textContent[source]).toBe(character);
      }
    } finally {
      dom.window.close();
    }
  });

  it("retains normalized paragraph spaces at speech split boundaries and original segment identities", () => {
    const html = `<p>${"word 😀 ".repeat(400)}</p><p>Second paragraph</p>`;
    const dom = new JSDOM(`<body>${html}</body>`);
    try {
      const listening = createListeningDocument(dom.window.document.body);
      const document = createNativeLibraryDocument(dom.window.document.body);
      expect(document.text).toBe(
        `${"word 😀 ".repeat(400).trim()}\n\nSecond paragraph`,
      );
      expect(document.revision).toBe(listening.revision);
      expect(document.segments.length).toBeGreaterThan(3);
      expect(document.paragraphs).toHaveLength(2);
      for (const segment of document.segments) {
        expect(document.text.slice(segment.start, segment.end)).toBe(
          segment.text,
        );
        expect(listening.segments[segment.index]?.text).toBe(segment.text);
      }
    } finally {
      dom.window.close();
    }
  });

  it("escapes on-device text and never treats it as executable HTML", () => {
    const html = nativeLibraryTextToHtml(
      '<script>alert("x")</script> & 😀\n\ne\u0301',
    );
    expect(html).not.toContain("<script>");
    expect(nativeLibraryDocumentFromHtml(html).text).toBe(
      '<script>alert("x")</script> & 😀\n\ne\u0301',
    );
    expect(
      nativeLibraryDocumentFromHtml(nativeLibraryTextToHtml("")).text,
    ).toBe("");
  });
});
