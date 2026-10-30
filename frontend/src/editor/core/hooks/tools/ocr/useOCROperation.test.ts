import { describe, expect, it } from "vitest";
import { ocrOperationConfig } from "@editor/hooks/tools/ocr/useOCROperation";

describe("OCR operation config", () => {
  it("accepts persistent storage references", () => {
    expect(ocrOperationConfig.storedFileReference).toBe(true);
  });
});
