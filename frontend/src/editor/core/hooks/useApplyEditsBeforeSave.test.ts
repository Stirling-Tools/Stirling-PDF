import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useApplyEditsBeforeSave } from "@editor/hooks/useApplyEditsBeforeSave";
import {
  __resetUnsavedWork,
  registerUnsavedWorkChecker,
} from "@editor/services/unsavedWork";

const state = vi.hoisted(() => ({
  workbench: "viewer",
  applyChanges: vi.fn<() => Promise<void>>(),
}));

vi.mock("@editor/contexts/NavigationContext", () => ({
  useNavigationState: () => ({ workbench: state.workbench }),
}));
vi.mock("@editor/contexts/ViewerContext", () => ({
  useViewer: () => ({ applyChanges: state.applyChanges }),
}));

beforeEach(() => {
  state.workbench = "viewer";
  state.applyChanges = vi.fn(async () => {});
});

afterEach(() => __resetUnsavedWork());

describe("useApplyEditsBeforeSave", () => {
  it("saves without applying when the viewer has no edits", async () => {
    registerUnsavedWorkChecker(() => false);
    const save = vi.fn();
    const { result } = renderHook(() => useApplyEditsBeforeSave(save));

    await act(() => result.current());

    expect(state.applyChanges).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("saves without applying outside the viewer", async () => {
    state.workbench = "fileEditor";
    registerUnsavedWorkChecker(() => true);
    const save = vi.fn();
    const { result } = renderHook(() => useApplyEditsBeforeSave(save));

    await act(() => result.current());

    expect(state.applyChanges).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("applies the edits, then runs the latest save once", async () => {
    registerUnsavedWorkChecker(() => true);
    const first = vi.fn();
    const latest = vi.fn();
    let renderLatest = () => {};
    state.applyChanges = vi.fn(async () => renderLatest());
    const { result, rerender } = renderHook(
      ({ save }) => useApplyEditsBeforeSave(save),
      { initialProps: { save: first } },
    );
    renderLatest = () => rerender({ save: latest });

    await act(() => result.current());

    expect(state.applyChanges).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it("does not save when applying fails", async () => {
    registerUnsavedWorkChecker(() => true);
    state.applyChanges = vi.fn(async () => {
      throw new Error("export failed");
    });
    const save = vi.fn();
    const { result } = renderHook(() => useApplyEditsBeforeSave(save));

    await act(() => result.current());

    expect(save).not.toHaveBeenCalled();
  });
});
