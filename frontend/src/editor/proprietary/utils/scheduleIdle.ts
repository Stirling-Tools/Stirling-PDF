// Idle-time scheduling shared by the classification/backfill passes.

/**
 * Schedule work for the browser's idle time. Main thread only: the entry-point
 * shim guarantees `requestIdleCallback`, but not in worker scope.
 */
export function scheduleIdle(task: () => void): () => void {
  const handle = requestIdleCallback(task, { timeout: 2000 });
  return () => cancelIdleCallback(handle);
}
