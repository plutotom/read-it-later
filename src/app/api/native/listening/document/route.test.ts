import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ session: vi.fn(), article: vi.fn() }));
vi.mock("~/server/auth", () => ({
  auth: { api: { getSession: state.session } },
}));
vi.mock("~/server/db", () => ({
  db: { query: { articles: { findFirst: state.article } } },
}));
import { GET } from "./route";

beforeEach(() => {
  state.session
    .mockReset()
    .mockResolvedValue({ user: { id: "fixture-owner" } });
  state.article.mockReset();
});
const id = "00000000-0000-4000-8000-000000000001";
it("rejects anonymous and missing/foreign articles before exposing text", async () => {
  expect(
    (
      await GET(
        new Request(
          "https://fixture.invalid/api/native/listening/document?articleId=" +
            id,
        ),
      )
    ).status,
  ).toBe(401);
  state.article.mockResolvedValue(undefined);
  expect(
    (
      await GET(
        new Request(
          "https://fixture.invalid/api/native/listening/document?articleId=" +
            id,
          { headers: { Authorization: "Bearer fixture" } },
        ),
      )
    ).status,
  ).toBe(404);
});
it("returns canonical text and exact web segment identities without generating audio", async () => {
  state.article.mockResolvedValue({
    id,
    title: "Fixture",
    content: "<p>Hello 😀.</p><p>A second paragraph.</p>",
  });
  const response = await GET(
    new Request(
      "https://fixture.invalid/api/native/listening/document?articleId=" + id,
      {
        headers: {
          Authorization: "Bearer fixture",
          Cookie: "must-be-stripped",
        },
      },
    ),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(
    (state.session.mock.calls[0]![0] as { headers: Headers }).headers.get(
      "cookie",
    ),
  ).toBeNull();
  const body = (await response.json()) as {
    text: string;
    segments: { index: number; text: string; start: number; end: number }[];
    contentHash: string;
    revision: string;
  };
  expect(body.text).toBe("Hello 😀.\n\nA second paragraph.");
  expect(body.contentHash).toMatch(/^[a-f0-9]{64}$/);
  expect(body.revision).toBeTruthy();
  for (const segment of body.segments)
    expect(body.text.slice(segment.start, segment.end)).toBe(segment.text);
});
