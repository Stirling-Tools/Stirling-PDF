interface YieldScheduler {
  yield?: () => Promise<void>;
}

/**
 * Yield control to the browser event loop to prevent blocking the main thread.
 *
 * Uses modern `scheduler.yield()` when available to preserve task priority
 * and avoid the HTML 4ms timer clamping penalty. Falls back to setTimeout(0).
 */
export async function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as unknown as { scheduler?: YieldScheduler })
    .scheduler;
  if (typeof scheduler?.yield === "function") {
    try {
      await scheduler.yield();
      return;
    } catch {
      // Fall through to setTimeout on error
    }
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}
