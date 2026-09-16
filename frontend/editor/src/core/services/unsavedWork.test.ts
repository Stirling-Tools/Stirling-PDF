import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerUnsavedWorkChecker,
  hasUnsavedWork,
  __resetUnsavedWork,
} from "@app/services/unsavedWork";

beforeEach(() => __resetUnsavedWork());
afterEach(() => vi.restoreAllMocks());

describe("hasUnsavedWork", () => {
  it("is clean before anything registers", () => {
    expect(hasUnsavedWork()).toBe(false);
  });

  it("reads the checker each time, not the value at registration", () => {
    let dirty = false;
    registerUnsavedWorkChecker(() => dirty);
    expect(hasUnsavedWork()).toBe(false);
    dirty = true;
    expect(hasUnsavedWork()).toBe(true);
  });

  it("is clean again once the provider unregisters", () => {
    const stop = registerUnsavedWorkChecker(() => true);
    stop();
    expect(hasUnsavedWork()).toBe(false);
  });

  it("keeps the newer checker when an unregister arrives late", () => {
    const stop = registerUnsavedWorkChecker(() => false);
    registerUnsavedWorkChecker(() => true);
    stop();
    expect(hasUnsavedWork()).toBe(true);
  });

  it("assumes unsaved work when the checker throws", () => {
    // Reading false here would let disk silently overwrite the user's edits.
    vi.spyOn(console, "error").mockImplementation(() => {});
    registerUnsavedWorkChecker(() => {
      throw new Error("provider unmounted mid-check");
    });
    expect(hasUnsavedWork()).toBe(true);
  });
});
