import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { combineAbortSignals } from "@editor/utils/combineAbortSignals";

const nativeAny = AbortSignal.any;
beforeEach(() => {
  Object.defineProperty(AbortSignal, "any", { value: undefined });
});
afterEach(() => {
  Object.defineProperty(AbortSignal, "any", { value: nativeAny });
});

it.each([false, true])(
  "propagates cancellation when already aborted: %s",
  (alreadyAborted) => {
    const first = new AbortController();
    const second = new AbortController();
    const removals = [first, second].map(({ signal }) =>
      vi.spyOn(signal, "removeEventListener"),
    );
    if (alreadyAborted) second.abort("closed");
    const combined = combineAbortSignals([first.signal, second.signal]);
    if (!alreadyAborted) second.abort("closed");
    expect(combined.signal.aborted).toBe(true);
    expect(combined.signal.reason).toBe("closed");
    first.abort("later");
    expect(combined.signal.reason).toBe("closed");
    for (const remove of removals)
      expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  },
);

it("disposes successful operations without cancelling them or retaining listeners", () => {
  const source = new AbortController();
  const remove = vi.spyOn(source.signal, "removeEventListener");
  const combined = combineAbortSignals([source.signal]);
  combined.dispose();
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  source.abort();
  expect(combined.signal.aborted).toBe(false);
});
