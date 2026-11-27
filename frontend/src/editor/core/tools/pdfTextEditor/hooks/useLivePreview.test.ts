import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLivePreview } from "@editor/tools/pdfTextEditor/hooks/useLivePreview";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";

/** Just the history the preview reads: a stack of steps, each a label. */
function fakeStore() {
  const steps: { label: string }[] = [];
  const store = {
    history: {
      peekUndo: () => steps[steps.length - 1] ?? null,
      breakCoalescing: () => {},
    },
    undo: () => void steps.pop(),
  };
  const apply = (label: string) => () => {
    steps.push({ label });
  };
  return {
    store: store as unknown as EditorStore,
    labels: () => steps.map((s) => s.label),
    apply,
  };
}

describe("useLivePreview", () => {
  it("swaps one preview for the next, leaving only the last", async () => {
    const { store, labels, apply } = fakeStore();
    const { result } = renderHook(() => useLivePreview(store));
    await act(() => result.current.preview(apply("Times")));
    await act(() => result.current.preview(apply("Courier")));
    expect(labels()).toEqual(["Courier"]);
    expect(result.current.active).toBe(true);
  });

  it("keeps the last preview as one step on Done", async () => {
    const { store, labels, apply } = fakeStore();
    const { result, unmount } = renderHook(() => useLivePreview(store));
    await act(() => result.current.preview(apply("Times")));
    await act(async () => result.current.keep());
    unmount();
    await act(() => Promise.resolve());
    expect(labels()).toEqual(["Times"]);
  });

  it("undoes the preview on Cancel", async () => {
    const { store, labels, apply } = fakeStore();
    const { result } = renderHook(() => useLivePreview(store));
    await act(() => result.current.preview(apply("Times")));
    await act(async () => result.current.cancel());
    expect(labels()).toEqual([]);
    expect(result.current.active).toBe(false);
  });

  it("undoes a preview left open when its control goes away", async () => {
    const { store, labels, apply } = fakeStore();
    const { result, unmount } = renderHook(() => useLivePreview(store));
    await act(() => result.current.preview(apply("Times")));
    unmount();
    await act(() => Promise.resolve());
    expect(labels()).toEqual([]);
  });

  it("never undoes a step it did not make", async () => {
    const { store, labels, apply } = fakeStore();
    const { result } = renderHook(() => useLivePreview(store));
    await act(() => result.current.preview(apply("Times")));
    // An edit lands on top of the preview.
    apply("typed")();
    await act(async () => result.current.cancel());
    expect(labels()).toEqual(["Times", "typed"]);
  });

  it("is not active when the change made no step", async () => {
    const { store, labels } = fakeStore();
    const { result } = renderHook(() => useLivePreview(store));
    await act(() => result.current.preview(() => "noGlyphs"));
    expect(labels()).toEqual([]);
    expect(result.current.active).toBe(false);
  });
});
