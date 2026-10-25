import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  isNativeLibraryPublicURL,
  nativeLibraryMutationsSchema,
} from "./native-library";

it("accepts only explicit public HTTP(S) create URLs without altering query semantics", () => {
  expect(
    isNativeLibraryPublicURL("https://example.com/page?a=1&a=2#part"),
  ).toBe(true);
  for (const url of [
    "text://fixture",
    "file:///tmp/a",
    "javascript:alert(1)",
    "https://localhost/a",
    "http://127.0.0.1/a",
    "http://2130706433/a",
    "https://[::1]/",
    "https://name.local/a",
    "https://u:p@example.com/a",
  ])
    expect(isNativeLibraryPublicURL(url)).toBe(false);
});

it("requires changed-field patches, protocol version and bounded well-formed text", () => {
  const mutation = {
    mutationId: randomUUID(),
    kind: "create",
    articleId: randomUUID(),
    url: "https://example.com/native",
    title: "Fixture",
    text: "😀e\u0301",
    isRead: false,
    isFavorite: false,
  };
  const parse = (item: unknown) =>
    nativeLibraryMutationsSchema.safeParse({
      protocolVersion: 1,
      mutations: [item],
    });
  expect(parse(mutation).success).toBe(true);
  for (const text of ["\uD800", "a\0b", "x".repeat(200_001)])
    expect(parse({ ...mutation, text }).success).toBe(false);
  expect(parse({ ...mutation, owner: "untrusted" }).success).toBe(false);
  expect(
    parse({
      mutationId: randomUUID(),
      kind: "update",
      articleId: randomUUID(),
      patch: {},
    }).success,
  ).toBe(false);
  expect(
    parse({
      mutationId: randomUUID(),
      kind: "update",
      articleId: randomUUID(),
      patch: { content: "no" },
    }).success,
  ).toBe(false);
  expect(
    nativeLibraryMutationsSchema.safeParse({
      protocolVersion: 1,
      mutations: Array(26).fill(mutation),
    }).success,
  ).toBe(false);
});
