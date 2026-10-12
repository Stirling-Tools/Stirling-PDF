import { useLayoutEffect, type PropsWithChildren, type RefObject } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HistoryAPI } from "@app/components/viewer/viewerTypes";
import { useHistoryAvailability } from "@app/hooks/useHistoryAvailability";

describe("useHistoryAvailability", () => {
  it("subscribes to a bridge installed during commit and follows its updates", () => {
    const historyApiRef: RefObject<HistoryAPI | null> = { current: null };
    const unsubscribe = vi.fn();
    let listener = () => {};
    const api: HistoryAPI = {
      undo: vi.fn(),
      redo: vi.fn(),
      canUndo: vi.fn(() => true),
      canRedo: vi.fn(() => false),
      subscribe: vi.fn((next) => {
        listener = next;
        return unsubscribe;
      }),
    };
    function Bridge({ children }: PropsWithChildren) {
      useLayoutEffect(() => {
        historyApiRef.current = api;
      }, []);
      return children;
    }
    const { result, rerender, unmount } = renderHook(
      () => useHistoryAvailability(historyApiRef),
      { wrapper: Bridge },
    );
    expect(result.current).toEqual({ canUndo: true, canRedo: false });
    rerender();
    expect(api.subscribe).toHaveBeenCalledTimes(1);
    vi.mocked(api.canUndo).mockReturnValue(false);
    vi.mocked(api.canRedo).mockReturnValue(true);
    act(() => listener());
    expect(result.current).toEqual({ canUndo: false, canRedo: true });
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("replaces a subscription when a later commit replaces the bridge", () => {
    const unsubscribe = vi.fn();
    const first: HistoryAPI = {
      undo: vi.fn(),
      redo: vi.fn(),
      canUndo: () => true,
      canRedo: () => false,
      subscribe: vi.fn(() => unsubscribe),
    };
    const second: HistoryAPI = {
      undo: vi.fn(),
      redo: vi.fn(),
      canUndo: () => false,
      canRedo: () => true,
      subscribe: vi.fn(() => vi.fn()),
    };
    const historyApiRef: RefObject<HistoryAPI | null> = { current: first };
    const { result, rerender } = renderHook(
      ({ api }) => {
        useLayoutEffect(() => {
          historyApiRef.current = api;
        }, [api]);
        return useHistoryAvailability(historyApiRef);
      },
      { initialProps: { api: first } },
    );
    rerender({ api: second });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(second.subscribe).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({ canUndo: false, canRedo: true });
  });
});
