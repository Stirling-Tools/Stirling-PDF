import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLICKS_REQUIRED,
  WINDOW_MS,
  useSecretClicks,
} from "@app/components/easterEgg/useSecretClicks";

// Driven off the real constants, so retuning the trigger does not need these
// rewritten - only the behaviour is asserted, never the specific number.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  const onUnlock = vi.fn();
  const { result } = renderHook(() => useSecretClicks<string>(onUnlock));
  return { onUnlock, click: (payload = "rect") => result.current(payload) };
}

describe("useSecretClicks", () => {
  it("does not unlock on a single click", () => {
    const { onUnlock, click } = setup();
    click();
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it("unlocks once a fast enough burst arrives", () => {
    const { onUnlock, click } = setup();
    for (let i = 0; i < CLICKS_REQUIRED; i++) click();
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it("does not unlock one click short of the threshold", () => {
    const { onUnlock, click } = setup();
    for (let i = 0; i < CLICKS_REQUIRED - 1; i++) click();
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it("never unlocks on a slow trickle, however many clicks", () => {
    const { onUnlock, click } = setup();
    for (let i = 0; i < CLICKS_REQUIRED * 3; i++) {
      click();
      vi.advanceTimersByTime(WINDOW_MS + 1);
    }
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it("hands the unlocking click's payload to the caller", () => {
    const { onUnlock, click } = setup();
    for (let i = 0; i < CLICKS_REQUIRED - 1; i++) click("early");
    click("the one that counted");
    expect(onUnlock).toHaveBeenCalledWith("the one that counted");
  });

  it("starts counting again after it fires, rather than firing every click", () => {
    const { onUnlock, click } = setup();
    for (let i = 0; i < CLICKS_REQUIRED; i++) click();
    expect(onUnlock).toHaveBeenCalledTimes(1);
    // The counter resets, so the next click starts a fresh attempt.
    click();
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it("does not carry stale clicks over from an abandoned attempt", () => {
    const { onUnlock, click } = setup();
    // An attempt that got one click from the threshold, then was given up on.
    for (let i = 0; i < CLICKS_REQUIRED - 1; i++) click();
    vi.advanceTimersByTime(WINDOW_MS + 1);
    // The stale clicks must not complete it.
    click();
    expect(onUnlock).not.toHaveBeenCalled();
  });
});
