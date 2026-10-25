import { beforeEach, expect, it, vi } from "vitest";
import { NativeLibraryError } from "~/server/services/native-library/errors";
const pull = vi.hoisted(() => vi.fn(async () => ({ protocolVersion: 2 })));
vi.mock("~/env", () => ({ env: { AUTH_SECRET: "synthetic-test-secret" } }));
vi.mock("~/server/services/native-library/service", () => ({
  pullNativeLibrary: pull,
}));
vi.mock("~/server/services/native-library/http", () => ({
  nativeLibraryRoute: async (
    _: Request,
    handle: (owner: string) => Promise<unknown>,
  ) => {
    try {
      return Response.json(await handle("verified-fixture-owner"));
    } catch (error) {
      if (error instanceof NativeLibraryError)
        return Response.json({ code: error.code }, { status: error.status });
      throw error;
    }
  },
}));
import { GET } from "./route";
beforeEach(() => pull.mockClear());
it("opts in explicitly while preserving default protocol 1", async () => {
  for (const [query, version] of [
    ["", 1],
    ["?protocolVersion=1", 1],
    ["?protocolVersion=2&limit=5&cursor=fixture", 2],
  ] as const) {
    expect(
      (await GET(new Request(`https://example.com/api/native/library${query}`)))
        .status,
    ).toBe(200);
    expect(pull).toHaveBeenLastCalledWith("verified-fixture-owner", {
      secret: "synthetic-test-secret",
      protocolVersion: version,
      cursor: version === 2 ? "fixture" : undefined,
      limit: version === 2 ? 5 : undefined,
    });
  }
});
it("rejects duplicate or unknown protocol versions before querying", async () => {
  for (const query of [
    "protocolVersion=",
    "protocolVersion=3",
    "protocolVersion=02",
    "protocolVersion=2&protocolVersion=1",
    "limit=0",
    "cursor=a&cursor=b",
  ]) {
    const response = await GET(
      new Request(`https://example.com/api/native/library?${query}`),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "invalid_query" });
  }
  expect(pull).not.toHaveBeenCalled();
});
