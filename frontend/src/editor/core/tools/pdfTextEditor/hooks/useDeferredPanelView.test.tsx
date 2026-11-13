import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { useDeferredPanelView } from "@editor/tools/pdfTextEditor/hooks/useDeferredPanelView";
import type { EditorViewState } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { SelectionState } from "@editor/tools/pdfTextEditor/types";

function select(runId: string): SelectionState {
  return {
    runIds: [runId],
    imageIds: [],
    shapeIds: [],
    caret: null,
    textRange: null,
  };
}

function viewState(overrides: Partial<EditorViewState> = {}): EditorViewState {
  return {
    pages: [],
    dirty: false,
    showRulers: false,
    ...overrides,
  } as unknown as EditorViewState;
}

function renderPanel() {
  const seen: { state: EditorViewState; selection: SelectionState }[] = [];
  function Panel(props: { state: EditorViewState; selection: SelectionState }) {
    seen.push(useDeferredPanelView(props.state, props.selection));
    return null;
  }
  const s0 = viewState();
  const a = select("A");
  const view = render(<Panel state={s0} selection={a} />);
  return { seen, view, Panel, s0, a };
}

describe("useDeferredPanelView", () => {
  it("describes a newly selected object on the first render after the change", () => {
    const { seen, view, Panel, s0 } = renderPanel();
    const b = select("B");
    const before = seen.length;
    view.rerender(<Panel state={s0} selection={b} />);
    const after = seen.slice(before);
    expect(after.length).toBeGreaterThan(0);
    for (const v of after) expect(v.selection).toBe(b);
  });

  it("keeps the previous snapshot for the urgent render while the selection is unchanged", () => {
    const { seen, view, Panel, s0, a } = renderPanel();
    const s1 = viewState({ pages: [], dirty: true });
    const before = seen.length;
    view.rerender(<Panel state={s1} selection={a} />);
    const after = seen.slice(before);
    expect(after[0].state).toBe(s0);
    expect(after[after.length - 1].state).toBe(s1);
  });

  it("shows a changed view setting on the first render after the change", () => {
    const { seen, view, Panel, a } = renderPanel();
    const s1 = viewState({ showRulers: true });
    const before = seen.length;
    view.rerender(<Panel state={s1} selection={a} />);
    const after = seen.slice(before);
    expect(after.length).toBeGreaterThan(0);
    for (const v of after) expect(v.state).toBe(s1);
  });
});
