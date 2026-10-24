/** Combines cancellation without requiring AbortSignal.any; dispose after completion to release listeners. */
export function combineAbortSignals(signals: readonly AbortSignal[]): {
  signal: AbortSignal;
  dispose: () => void;
} {
  if (typeof AbortSignal.any === "function")
    return { signal: AbortSignal.any([...signals]), dispose: () => {} };
  const controller = new AbortController();
  const dispose = () => {
    for (const signal of signals) signal.removeEventListener("abort", abort);
  };
  const abort = () => {
    const source = signals.find((signal) => signal.aborted);
    if (!source) return;
    dispose();
    controller.abort(source.reason);
  };
  for (const signal of signals)
    signal.addEventListener("abort", abort, { once: true });
  abort();
  return { signal: controller.signal, dispose };
}
