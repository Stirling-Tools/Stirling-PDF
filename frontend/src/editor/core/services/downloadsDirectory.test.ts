import { describe, expect, it } from "vitest";
import { getDownloadsDirectory } from "@app/services/downloadsDirectory";

describe("getDownloadsDirectory (core)", () => {
  // Pins the stub: a real path here would make the Downloads offer appear on web builds,
  // which have no machine to read.
  it("has no directory to report", async () => {
    await expect(getDownloadsDirectory()).resolves.toBeNull();
  });
});
