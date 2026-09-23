import { describe, it, expect } from "vitest";
import { diskLinkState } from "@app/services/diskLinkState";

describe("diskLinkState", () => {
  it("is 'none' for a file that never came from disk", () => {
    expect(diskLinkState({})).toBe("none");
  });

  it("is 'unavailable' while the original cannot be reached", () => {
    expect(
      diskLinkState({
        localFilePath: "/Volumes/Backup/report.pdf",
        diskUnavailableReason: "offline",
      }),
    ).toBe("unavailable");
  });

  it("still reports a conflict when disk has also gone quiet", () => {
    expect(
      diskLinkState({
        localFilePath: "/Volumes/Backup/report.pdf",
        diskConflictAt: 1,
        diskUnavailableReason: "offline",
      }),
    ).toBe("conflict");
  });

  it("is 'linked' while the original is present and agrees", () => {
    expect(diskLinkState({ localFilePath: "C:/docs/report.pdf" })).toBe(
      "linked",
    );
  });

  it("is 'orphaned' once the original is gone", () => {
    // The distinction the UI could not previously draw: this is NOT the same as
    // a file that was never saved, and it must not read like one.
    expect(diskLinkState({ orphanedFilePath: "C:/docs/report.pdf" })).toBe(
      "orphaned",
    );
  });

  it("is 'conflict' while a divergence is unresolved", () => {
    expect(
      diskLinkState({
        localFilePath: "C:/docs/report.pdf",
        diskConflictAt: 1234,
      }),
    ).toBe("conflict");
  });
});
