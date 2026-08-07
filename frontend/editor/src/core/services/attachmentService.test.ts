import { describe, it, expect } from "vitest";
import { truncateMiddle } from "@app/services/attachmentService";

describe("truncateMiddle", () => {
  it("returns short filenames untouched", () => {
    expect(truncateMiddle("repro.pdf", 26)).toBe("repro.pdf");
    expect(truncateMiddle("notes.txt", 26)).toBe("notes.txt");
  });

  it("middle-truncates long filenames while preserving file extension", () => {
    const longName =
      "Season of Storms - Andrzej Sapkowski, Szűcs Balázs, David French (2013)_converted_converted.pdf";
    const truncated = truncateMiddle(longName, 26);
    expect(truncated.endsWith(".pdf")).toBe(true);
    expect(truncated.includes("...")).toBe(true);
    expect(truncated.length).toBeLessThanOrEqual(26);
  });

  it("handles filenames without extensions cleanly", () => {
    const longNoExt = "VeryLongFileNameWithoutExtensionWordWordWord";
    const truncated = truncateMiddle(longNoExt, 20);
    expect(truncated.includes("...")).toBe(true);
    expect(truncated.length).toBeLessThanOrEqual(20);
  });
});
