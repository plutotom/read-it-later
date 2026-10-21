import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  admins: "owner, second-owner",
}));
vi.mock("~/env", () => ({
  env: {
    get AUDIO_USAGE_ADMIN_IDS() {
      return mocks.admins;
    },
  },
}));
vi.mock("~/server/db", () => ({ db: { select: mocks.query } }));
import { audioReport, isAudioAdmin } from "./reports";
describe("audio report authorization", () => {
  it("defaults to no administrators and requires exact server-owned IDs", () => {
    expect(isAudioAdmin("owner")).toBe(true);
    expect(isAudioAdmin("second-owner")).toBe(true);
    expect(isAudioAdmin("ow")).toBe(false);
    expect(isAudioAdmin("owner, second-owner")).toBe(false);
    mocks.admins = "";
    expect(isAudioAdmin("owner")).toBe(false);
  });
  it("rejects unauthorized aggregate access before any database query", async () => {
    await expect(audioReport("another-user", "2026-10", true)).rejects.toThrow(
      "Forbidden",
    );
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
