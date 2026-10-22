import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFolderPickerBack } from "@app/components/policies/useFolderPickerBack";

const routeState = { idx: 4, key: "editor", usr: { keep: true } };

beforeEach(() => {
  const entries: unknown[] = [routeState];
  let index = 0;
  vi.spyOn(window.history, "state", "get").mockImplementation(
    () => entries[index],
  );
  vi.spyOn(window.history, "pushState").mockImplementation((state) => {
    entries.splice(++index);
    entries.push(state);
  });
  vi.spyOn(window.history, "back").mockImplementation(() => {
    if (index > 0) {
      index -= 1;
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: entries[index] }),
      );
    }
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useFolderPickerBack", () => {
  it("consumes browser and button Back without sending folder visits to the editor router", () => {
    const restore = vi
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const router = vi.fn();
    window.addEventListener("popstate", router);
    const { result, unmount } = renderHook(() =>
      useFolderPickerBack(true, restore),
    );
    expect(window.history.state).toMatchObject(routeState);
    act(() => window.history.back());
    expect(restore).toHaveBeenCalledTimes(1);
    expect(router).not.toHaveBeenCalled();
    act(() => result.current());
    expect(restore).toHaveBeenCalledTimes(2);
    expect(window.history.state).toEqual(routeState);
    unmount();
    expect(window.history.back).toHaveBeenCalledTimes(2);
    window.removeEventListener("popstate", router);
  });

  it("handles keyboard Back while leaving text editing alone", () => {
    const restore = vi.fn().mockReturnValue(true);
    renderHook(() => useFolderPickerBack(true, restore));
    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(restore).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Backspace" });
    fireEvent.keyDown(input, { key: "ArrowLeft", altKey: true });
    expect(restore).toHaveBeenCalledTimes(2);
    input.remove();
  });

  it("removes its temporary history entry and keyboard handler when the picker is hidden", () => {
    const restore = vi.fn();
    const { rerender } = renderHook(
      ({ active }) => useFolderPickerBack(active, restore),
      {
        initialProps: { active: true },
      },
    );
    rerender({ active: false });
    expect(window.history.state).toEqual(routeState);
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(restore).not.toHaveBeenCalled();
    expect(window.history.back).toHaveBeenCalledTimes(1);
  });

  it("does not rewind a route opened while the wizard closes", () => {
    const { unmount } = renderHook(() => useFolderPickerBack(true, vi.fn()));
    window.history.pushState({ key: "files", idx: 5 }, "");
    unmount();
    expect(window.history.back).not.toHaveBeenCalled();
    expect(window.history.state).toEqual({ key: "files", idx: 5 });
  });
});
