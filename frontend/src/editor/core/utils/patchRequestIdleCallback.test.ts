import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { patchRequestIdleCallback } from "@app/utils/patchRequestIdleCallback";

/** Two things must hold: it stands in where the API is absent, and it never
 *  displaces a real implementation. */

type IdleGlobals = {
  requestIdleCallback?: unknown;
  cancelIdleCallback?: unknown;
};

const globals = globalThis as IdleGlobals;

let saved: IdleGlobals;

beforeEach(() => {
  vi.useFakeTimers();
  saved = {
    requestIdleCallback: globals.requestIdleCallback,
    cancelIdleCallback: globals.cancelIdleCallback,
  };
});

afterEach(() => {
  vi.useRealTimers();
  globals.requestIdleCallback = saved.requestIdleCallback;
  globals.cancelIdleCallback = saved.cancelIdleCallback;
});

describe("patchRequestIdleCallback", () => {
  it("stands in where the engine has no requestIdleCallback", () => {
    delete globals.requestIdleCallback;
    delete globals.cancelIdleCallback;
    patchRequestIdleCallback();

    const task = vi.fn();
    requestIdleCallback(task);

    // Asynchronous: never runs on the caller's own turn.
    expect(task).not.toHaveBeenCalled();
    // With no deadline given, it yields briefly and then runs.
    vi.advanceTimersByTime(200);
    expect(task).toHaveBeenCalledTimes(1);

    const deadline = task.mock.calls[0][0] as IdleDeadline;
    expect(deadline.didTimeout).toBe(false);
    expect(deadline.timeRemaining()).toBeGreaterThan(0);
  });

  it("never runs later than the deadline the caller asked for", () => {
    delete globals.requestIdleCallback;
    patchRequestIdleCallback();

    const task = vi.fn();
    requestIdleCallback(task, { timeout: 50 });
    vi.advanceTimersByTime(50);
    expect(task).toHaveBeenCalledTimes(1);
  });

  // `src/index.tsx` asks for 2000ms so the pdfium WASM compile doesn't land on
  // top of the app's first renders.
  it("does not run background work earlier than the caller allowed for", () => {
    delete globals.requestIdleCallback;
    patchRequestIdleCallback();

    const task = vi.fn();
    requestIdleCallback(task, { timeout: 2000 });
    vi.advanceTimersByTime(1999);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("cancels a scheduled task by handle", () => {
    delete globals.requestIdleCallback;
    delete globals.cancelIdleCallback;
    patchRequestIdleCallback();

    const task = vi.fn();
    cancelIdleCallback(requestIdleCallback(task));
    vi.advanceTimersByTime(1000);
    expect(task).not.toHaveBeenCalled();
  });

  it("leaves a real implementation alone", () => {
    const native = vi.fn();
    globals.requestIdleCallback = native;
    patchRequestIdleCallback();
    expect(globals.requestIdleCallback).toBe(native);
  });
});
