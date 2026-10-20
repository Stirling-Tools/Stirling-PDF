import { describe, expect, it } from "vitest";
import { adjustContrastOperationConfig } from "@app/hooks/tools/adjustContrast/useAdjustContrastOperation";
import { defaultParameters } from "@app/hooks/tools/adjustContrast/useAdjustContrastParameters";
import { onTiming, type ToolTiming } from "@app/services/toolTiming";

describe("adjustContrast timing", () => {
  it("reports each run as the TypeScript implementation in the browser", async () => {
    const timings: ToolTiming[] = [];
    const stopListening = onTiming("adjustColors", "typescript", (timing) =>
      timings.push(timing),
    );
    try {
      // No files: the run still completes, without needing pdf.js or a canvas.
      await adjustContrastOperationConfig.customProcessor(
        defaultParameters,
        [],
      );
    } finally {
      stopListening();
    }

    expect(timings).toEqual([
      expect.objectContaining({
        implementation: "typescript",
        location: "browser",
        files: 0,
        serverProcessingMs: null,
      }),
    ]);
  });
});
