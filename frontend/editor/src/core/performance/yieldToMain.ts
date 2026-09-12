/**
 * Yield to the browser's event loop between units of long-running work so the
 * main thread stays responsive (INP optimization).
 *
 * Uses the Baseline 2026 `scheduler.yield()` when available (Chrome 129+,
 * which yields to the next frame as soon as possible instead of a full task
 * boundary). Falls back to a MessageChannel macrotask (faster than setTimeout
 * under input-pressure heuristics), then to setTimeout as a last resort.
 */

interface SchedulerLike {
  yield?: () => Promise<void>;
}

const schedulerLike: SchedulerLike | undefined =
  typeof globalThis.scheduler !== "undefined"
    ? (globalThis.scheduler as SchedulerLike)
    : undefined;

function messageChannelYield(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(null);
  });
}

export function yieldToMain(): Promise<void> {
  if (schedulerLike && typeof schedulerLike.yield === "function") {
    return schedulerLike.yield();
  }
  if (typeof MessageChannel === "function") {
    return messageChannelYield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}
