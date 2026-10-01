import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordGuestToolRun } from "@app/services/guestToolReminder";

describe("guest tool signup reminders", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("reminds every two runs without exhausting an allowance", () => {
    expect(
      Array.from({ length: 6 }, () => recordGuestToolRun("cadence")),
    ).toEqual([false, true, false, true, false, true]);
  });

  it("persists the cadence across a fresh module load", async () => {
    expect(recordGuestToolRun("reload")).toBe(false);
    vi.resetModules();
    const reloaded = await import("@app/services/guestToolReminder");
    expect(reloaded.recordGuestToolRun("reload")).toBe(true);
  });

  it("keeps guest accounts separate", () => {
    expect(recordGuestToolRun("first")).toBe(false);
    expect(recordGuestToolRun("second")).toBe(false);
    expect(recordGuestToolRun("first")).toBe(true);
  });

  it("ignores invalid stored counts", () => {
    localStorage.setItem("stirling:guest-tool-reminder:invalid", "broken");
    expect(recordGuestToolRun("invalid")).toBe(false);
    expect(recordGuestToolRun("invalid")).toBe(true);
  });

  it("falls back to this tab when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    expect(recordGuestToolRun("no-storage")).toBe(false);
    expect(recordGuestToolRun("no-storage")).toBe(true);
  });
});
