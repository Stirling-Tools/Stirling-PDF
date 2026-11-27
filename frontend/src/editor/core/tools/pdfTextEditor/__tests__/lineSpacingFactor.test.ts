import { expect, test } from "vitest";
import { lineSpacingFactor } from "@editor/tools/pdfTextEditor/commands/SetLineSpacingCommand";

test.each([1, 1.15, 1.5, 2])(
  "reads back the %s spacing the menu set",
  (factor) => {
    for (const fontSize of [9, 11, 12.5, 24]) {
      expect(lineSpacingFactor(fontSize, fontSize * 1.2 * factor)).toBe(factor);
    }
  },
);

test("has no factor without a size or a line height", () => {
  expect(lineSpacingFactor(0, 14)).toBeNull();
  expect(lineSpacingFactor(12, 0)).toBeNull();
});
