import { afterEach, describe, expect, it } from "vitest";

import {
  ChecksumUnsupportedError,
  canVerifyChecksums,
} from "@app/services/formDetection/modelCache";

// Web Crypto only exists in a secure context, so a self-hosted http:// deployment has no way to
// hash the model it downloads. That has to surface as an explanation, not a TypeError.
describe("checksum capability", () => {
  const realSubtle = globalThis.crypto?.subtle;

  afterEach(() => {
    if (realSubtle) {
      Object.defineProperty(globalThis.crypto, "subtle", {
        value: realSubtle,
        configurable: true,
      });
    }
  });

  function withoutSubtle() {
    Object.defineProperty(globalThis.crypto, "subtle", {
      value: undefined,
      configurable: true,
    });
  }

  it("reports availability in a secure context", () => {
    expect(canVerifyChecksums()).toBe(true);
  });

  it("reports unavailability when subtle crypto is missing", () => {
    withoutSubtle();
    expect(canVerifyChecksums()).toBe(false);
  });

  it("names HTTPS as the fix rather than leaking a TypeError", () => {
    const error = new ChecksumUnsupportedError();
    expect(error.name).toBe("ChecksumUnsupportedError");
    expect(error.message).toContain("HTTPS");
  });
});
