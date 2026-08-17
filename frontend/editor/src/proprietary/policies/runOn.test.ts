import { describe, it, expect } from "vitest";
import { defaultRunOn, resolveRunOn } from "@app/policies/runOn";

describe("defaultRunOn", () => {
  it("defaults Security to export", () => {
    expect(defaultRunOn("security")).toBe("export");
  });

  it("defaults any other, unknown or missing category to upload", () => {
    for (const id of ["classification", "compliance", "nope", "", undefined]) {
      expect(defaultRunOn(id)).toBe("upload");
    }
  });
});

describe("resolveRunOn", () => {
  it("keeps an explicitly saved value over the category default", () => {
    expect(resolveRunOn("upload", "security")).toBe("upload");
    expect(resolveRunOn("export", "classification")).toBe("export");
  });

  it("falls back to the category default when unset or invalid", () => {
    expect(resolveRunOn(undefined, "security")).toBe("export");
    expect(resolveRunOn("nonsense", "security")).toBe("export");
    expect(resolveRunOn(undefined, "classification")).toBe("upload");
  });
});
