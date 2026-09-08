import { describe, expect, test } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTourActive } from "@app/hooks/useTourActive";
import {
  TOUR_STATE_EVENT,
  dispatchTourState,
} from "@app/constants/events";

describe("useTourActive", () => {
  test("starts inactive", () => {
    const { result } = renderHook(() => useTourActive());
    expect(result.current).toBe(false);
  });

  test("flips true while a tour is open and back to false when it closes", () => {
    const { result } = renderHook(() => useTourActive());

    act(() => dispatchTourState(true));
    expect(result.current).toBe(true);

    act(() => dispatchTourState(false));
    expect(result.current).toBe(false);
  });

  test("treats a payload-less tour-state event as inactive", () => {
    const { result } = renderHook(() => useTourActive());

    act(() => dispatchTourState(true));
    expect(result.current).toBe(true);

    // Defensive: an event with no detail must not read as "tour open".
    act(() => window.dispatchEvent(new Event(TOUR_STATE_EVENT)));
    expect(result.current).toBe(false);
  });

  test("stops listening after unmount", () => {
    const { result, unmount } = renderHook(() => useTourActive());
    unmount();

    act(() => dispatchTourState(true));
    // No throw and no stale update: the listener was removed on unmount.
    expect(result.current).toBe(false);
  });
});
