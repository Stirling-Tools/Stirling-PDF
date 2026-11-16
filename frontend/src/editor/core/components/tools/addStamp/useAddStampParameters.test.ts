import { describe, expect, it } from "vitest";
import {
  MAX_QR_CONTENT_BYTES,
  defaultParameters,
  isQrContentWithinLimit,
  validateAddStampParameters,
} from "@editor/components/tools/addStamp/useAddStampParameters";
import { addStampToApiParams } from "@editor/components/tools/addStamp/useAddStampOperation";

const qrParams = (stampText: string) => ({
  ...defaultParameters,
  stampType: "qr" as const,
  stampText,
});

describe("QR stamp parameters", () => {
  it("rejects blank content", () => {
    expect(validateAddStampParameters(qrParams("   "))).toBe(false);
  });

  it("accepts content up to the byte limit", () => {
    expect(
      validateAddStampParameters(qrParams("a".repeat(MAX_QR_CONTENT_BYTES))),
    ).toBe(true);
  });

  it("limits multi-byte content by UTF-8 bytes, not characters", () => {
    const threeByteChars = "日".repeat(Math.ceil(MAX_QR_CONTENT_BYTES / 3) + 1);
    expect(threeByteChars.length).toBeLessThan(MAX_QR_CONTENT_BYTES);
    expect(isQrContentWithinLimit(threeByteChars)).toBe(false);
    expect(validateAddStampParameters(qrParams(threeByteChars))).toBe(false);
  });

  it("sends the content as stampText", () => {
    const apiParams = addStampToApiParams(qrParams("https://example.com"));
    expect(apiParams.stampType).toBe("qr");
    expect(apiParams.stampText).toBe("https://example.com");
  });
});
