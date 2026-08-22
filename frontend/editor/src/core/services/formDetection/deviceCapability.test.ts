import { describe, expect, it } from "vitest";

import {
  describeDevice,
  isUnderpoweredForBrowserEngine,
} from "@app/services/formDetection/deviceCapability";

describe("isUnderpoweredForBrowserEngine", () => {
  it("keeps a normal machine on the browser engine", () => {
    expect(isUnderpoweredForBrowserEngine({ cores: 8, memoryGb: 8 })).toBe(
      false,
    );
  });

  // The floors are inclusive: exactly 4 cores / 4GB is still considered capable, so the common
  // low-end-but-usable laptop keeps its document on the device.
  it("keeps a device that sits exactly on the floor", () => {
    expect(isUnderpoweredForBrowserEngine({ cores: 4, memoryGb: 4 })).toBe(
      false,
    );
  });

  it("sends a device below the core floor to the server", () => {
    expect(isUnderpoweredForBrowserEngine({ cores: 3, memoryGb: 8 })).toBe(
      true,
    );
    expect(isUnderpoweredForBrowserEngine({ cores: 2, memoryGb: 8 })).toBe(
      true,
    );
    expect(isUnderpoweredForBrowserEngine({ cores: 1 })).toBe(true);
  });

  it("sends a device below the memory floor to the server", () => {
    expect(isUnderpoweredForBrowserEngine({ cores: 8, memoryGb: 2 })).toBe(
      true,
    );
    // deviceMemory reports fractions on very small devices.
    expect(isUnderpoweredForBrowserEngine({ cores: 8, memoryGb: 0.5 })).toBe(
      true,
    );
  });

  // deviceMemory is Chromium-only; Firefox and Safari report nothing. Treating "unknown" as weak
  // would quietly move every non-Chromium user's document to the backend.
  it("treats unknown hints as capable, not weak", () => {
    expect(isUnderpoweredForBrowserEngine({})).toBe(false);
    expect(isUnderpoweredForBrowserEngine({ cores: 8 })).toBe(false);
    expect(isUnderpoweredForBrowserEngine({ memoryGb: 8 })).toBe(false);
  });

  // navigator.hardwareConcurrency can be 0 or absent; readHints() maps those to undefined, so a
  // bogus zero must not read as the weakest possible machine.
  it("does not treat a zero reading as a weak device", () => {
    expect(isUnderpoweredForBrowserEngine({ cores: undefined })).toBe(false);
  });

  it("describes what it saw, including gaps", () => {
    expect(describeDevice({ cores: 8, memoryGb: 16 })).toBe(
      "8 cores, 16GB RAM",
    );
    expect(describeDevice({ cores: 8 })).toBe("8 cores, RAM unknown");
    expect(describeDevice({})).toBe("cores unknown, RAM unknown");
  });
});
