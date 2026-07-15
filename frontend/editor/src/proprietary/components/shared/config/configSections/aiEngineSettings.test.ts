import { describe, expect, it } from "vitest";
import { clampMin } from "@app/components/shared/config/configSections/aiEngineSettings";

describe("clampMin", () => {
  it("keeps a valid integer unchanged", () => {
    expect(clampMin(8192, 1)).toBe(8192);
    expect(clampMin(200, 1)).toBe(200);
  });

  it("floors below the minimum for empty / zero / NaN / junk input", () => {
    // A cleared NumberInput yields "" -> 0; a transient "-" -> NaN; both must clamp to min.
    expect(clampMin("", 1)).toBe(1);
    expect(clampMin(0, 1)).toBe(1);
    expect(clampMin(Number.NaN, 1)).toBe(1);
    expect(clampMin(undefined, 1)).toBe(1);
    expect(clampMin("-", 1)).toBe(1);
  });

  it("floors fractional values to an integer", () => {
    expect(clampMin(5.7, 1)).toBe(5);
  });

  it("allows zero when the minimum is zero (e.g. maxSearches)", () => {
    expect(clampMin(0, 0)).toBe(0);
    expect(clampMin("", 0)).toBe(0);
    expect(clampMin(4, 0)).toBe(4);
  });
});
