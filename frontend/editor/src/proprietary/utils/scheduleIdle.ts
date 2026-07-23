// Idle-time scheduling shared by the classification/backfill passes.

/** Schedule work for the browser's idle time (or soon after, as a fallback). */
export function scheduleIdle(task: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(task, { timeout: 2000 });
    return () => cancelIdleCallback(handle);
  }
  const timer = window.setTimeout(task, 200);
  return () => window.clearTimeout(timer);
}
