import { describe, expect, it } from "vitest";
import { Selection } from "@editor/tools/pdfTextEditor/store/Selection";

describe("Selection text ranges", () => {
  it("records a range only for the run that is the whole selection", () => {
    const selection = new Selection();
    selection.selectOne("a");
    selection.setTextRange("b", { start: 0, end: 2 });
    expect(selection.value.textRange).toBeNull();
    selection.setTextRange("a", { start: 1, end: 3 });
    expect(selection.value.textRange).toEqual({ start: 1, end: 3 });
    selection.toggle("b");
    expect(selection.value.textRange).toBeNull();
  });

  it("drops the range when the selection changes", () => {
    const selection = new Selection();
    selection.selectOne("a");
    selection.setTextRange("a", { start: 1, end: 3 });
    selection.selectOne("a");
    expect(selection.value.textRange).toBeNull();
  });
});
