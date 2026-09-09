// WebKit ships no `requestIdleCallback`. The shim honours the async/deadline/
// cancel contract, not the *idle* part, and is window-only like the real API.

/** Short delay before running, so the current turn's work drains first. */
const YIELD_MS = 200;

/** Idle-deadline shape for the timer stand-in. A small positive budget keeps a
 *  `while (timeRemaining() > 0)` loop doing one chunk rather than spinning. */
function makeDeadline(): IdleDeadline {
  return { didTimeout: false, timeRemaining: () => 1 };
}

export function patchRequestIdleCallback(): void {
  if (typeof globalThis === "undefined") return;
  const target = globalThis as typeof globalThis & {
    requestIdleCallback?: typeof requestIdleCallback;
    cancelIdleCallback?: typeof cancelIdleCallback;
  };
  if (typeof target.requestIdleCallback === "function") return;

  target.requestIdleCallback = (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ): number =>
    setTimeout(
      () => callback(makeDeadline()),
      // Honour the caller's deadline: `timeout` is them saying how long this may
      // wait, so firing earlier lands background work on top of startup.
      options?.timeout ?? YIELD_MS,
    ) as unknown as number;

  target.cancelIdleCallback = (handle: number): void => {
    clearTimeout(handle);
  };
}

patchRequestIdleCallback();
