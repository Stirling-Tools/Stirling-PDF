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

  it("keeps exact spans for a multi-run selection until it changes", () => {
    const selection = new Selection();
    const spans = [
      { runId: "a", range: { start: 1, end: 4 } },
      { runId: "b", range: { start: 0, end: 3 } },
    ];
    selection.set(
      {
        runIds: ["a", "b"],
        imageIds: [],
        shapeIds: [],
        formFieldId: null,
        caret: null,
        textRange: null,
      },
      spans,
    );
    expect(selection.spans).toEqual(spans);
    selection.toggle("c");
    expect(selection.spans).toBeNull();
  });
});
