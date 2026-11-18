import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCommitEditsBeforeSave } from "@editor/hooks/useCommitEditsBeforeSave";
import type { NavigationWarningHandlers } from "@editor/contexts/NavigationContext";
import {
  __resetUnsavedWork,
  registerUnsavedWorkChecker,
} from "@editor/services/unsavedWork";

const handlersRef = vi.hoisted(() => ({
  current: null as NavigationWarningHandlers | null,
}));

vi.mock("@editor/contexts/NavigationContext", () => ({
  useNavigationActions: () => ({
    actions: { navigationWarningHandlersRef: handlersRef },
  }),
}));

let commit: ReturnType<typeof vi.fn<() => Promise<void>>>;

beforeEach(() => {
  commit = vi.fn(async () => {});
  handlersRef.current = { onApplyAndContinue: commit };
});

afterEach(() => __resetUnsavedWork());

describe("useCommitEditsBeforeSave", () => {
  it("saves without committing when the editor has no edits", async () => {
    registerUnsavedWorkChecker(() => false);
    const save = vi.fn();
    const { result } = renderHook(() => useCommitEditsBeforeSave(save));

    await act(() => result.current());

    expect(commit).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("saves without committing when no editor can commit", async () => {
    registerUnsavedWorkChecker(() => true);
    handlersRef.current = null;
    const save = vi.fn();
    const { result } = renderHook(() => useCommitEditsBeforeSave(save));

    await act(() => result.current());

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("saves without committing when told not to", async () => {
    registerUnsavedWorkChecker(() => true);
    const save = vi.fn();
    const { result } = renderHook(() =>
      useCommitEditsBeforeSave(save, { commitEdits: false }),
    );

    await act(() => result.current());

    expect(commit).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("commits the edits, then runs the latest save once", async () => {
    registerUnsavedWorkChecker(() => true);
    const first = vi.fn();
    const latest = vi.fn();
    let renderLatest = () => {};
    commit.mockImplementation(async () => renderLatest());
    const { result, rerender } = renderHook(
      ({ save }) => useCommitEditsBeforeSave(save),
      { initialProps: { save: first } },
    );
    renderLatest = () => rerender({ save: latest });

    await act(() => result.current());

    expect(commit).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it("does not save when the commit fails", async () => {
    registerUnsavedWorkChecker(() => true);
    commit.mockRejectedValue(new Error("export failed"));
    const save = vi.fn();
    const { result } = renderHook(() => useCommitEditsBeforeSave(save));

    await act(() => result.current());

    expect(save).not.toHaveBeenCalled();
  });
});
