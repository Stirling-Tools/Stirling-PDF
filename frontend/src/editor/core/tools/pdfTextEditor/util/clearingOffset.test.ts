import { describe, expect, it } from "vitest";
import { offsetClearing } from "@editor/tools/pdfTextEditor/util/clearingOffset";

const rect = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
});
const DROPDOWN = { left: 700, right: 1050, height: 80 };

describe("offsetClearing", () => {
  it("keeps the usual gap when nothing selected sits under the dropdown", () => {
    expect(
      offsetClearing(84, DROPDOWN, [rect(340, 400, 900, 430)], 8, 900),
    ).toBe(8);
  });

  it("drops the dropdown below a selected line it would cover", () => {
    expect(
      offsetClearing(84, DROPDOWN, [rect(338, 137, 895, 184)], 8, 900),
    ).toBe(184 + 8 - 84);
  });

  it("ignores selected text beside the dropdown", () => {
    expect(
      offsetClearing(84, DROPDOWN, [rect(100, 100, 650, 140)], 8, 900),
    ).toBe(8);
  });

  it("clears every stacked line it would land on", () => {
    expect(
      offsetClearing(
        84,
        DROPDOWN,
        [rect(338, 200, 895, 230), rect(338, 100, 895, 150)],
        8,
        900,
      ),
    ).toBe(230 + 8 - 84);
  });

  it("keeps the usual gap when clearing the text would push it off screen", () => {
    expect(
      offsetClearing(84, DROPDOWN, [rect(338, 100, 895, 860)], 8, 900),
    ).toBe(8);
  });
});
