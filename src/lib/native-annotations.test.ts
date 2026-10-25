import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { NATIVE_ANNOTATION_COLORS } from "./native-annotations";
import { nativeLibraryMutationsSchema } from "./native-library";
it("requires explicit protocol 2, UUIDs and exact field-only annotation mutations", () => {
  const base = { mutationId: randomUUID(), articleId: randomUUID() };
  const note = {
    ...base,
    kind: "note.create",
    noteId: randomUUID(),
    content: "Independent 😀",
  };
  const parse = (mutation: unknown, protocolVersion = 2) =>
    nativeLibraryMutationsSchema.safeParse({
      protocolVersion,
      mutations: [mutation],
    }).success;
  expect(parse(note)).toBe(true);
  expect(parse(note, 1)).toBe(false);
  for (const patch of [
    { noteId: undefined },
    { noteId: "not-a-uuid" },
    { userId: "attacker" },
    { content: "\0" },
    { content: "x".repeat(200_001) },
  ])
    expect(parse({ ...note, ...patch })).toBe(false);
  for (const patch of [
    {},
    { content: "new", highlightId: null },
    { content: "new", position: {} },
  ])
    expect(
      parse({ ...base, kind: "note.update", noteId: note.noteId, patch }),
    ).toBe(false);
  expect(
    parse({
      ...base,
      kind: "note.update",
      noteId: note.noteId,
      patch: { content: "" },
    }),
  ).toBe(true);
  for (const color of NATIVE_ANNOTATION_COLORS)
    expect(
      parse({
        ...base,
        kind: "highlight.update",
        highlightId: randomUUID(),
        patch: { color },
      }),
    ).toBe(true);
  expect(
    parse({
      ...base,
      kind: "highlight.update",
      highlightId: randomUUID(),
      patch: { color: "cyan" },
    }),
  ).toBe(false);
});
