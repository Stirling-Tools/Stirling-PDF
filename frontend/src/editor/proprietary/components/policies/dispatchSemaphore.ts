/**
 * Bounded concurrency for policy run-dispatch uploads.
 *
 * Each dispatch POSTs a file's bytes; firing a whole drop at once saturates the
 * browser's per-origin connection pool, so status polls and output downloads of
 * already-running files queue behind the pending uploads and nothing visibly
 * progresses. A small window keeps connections free.
 *
 * `priority` (a chained/downstream dispatch) jumps to the FRONT of the queue, so
 * a file already mid-chain finishes its whole policy flow before a brand-new
 * file's first policy starts. Without it a chained dispatch would sit behind the
 * entire first-policy wave (FIFO) — e.g. classification wouldn't start on any
 * file until security had finished on all of them.
 */
const MAX_CONCURRENT_DISPATCHES = 4;

let slotsInUse = 0;
const waiters: Array<() => void> = [];

export async function acquireDispatchSlot(priority = false): Promise<void> {
  if (slotsInUse < MAX_CONCURRENT_DISPATCHES) {
    slotsInUse++;
    return;
  }
  await new Promise<void>((resolve) => {
    if (priority) waiters.unshift(resolve);
    else waiters.push(resolve);
  });
}

export function releaseDispatchSlot(): void {
  const next = waiters.shift();
  // Hand the slot straight to the next waiter, else free it.
  if (next) next();
  else slotsInUse--;
}

/** Test-only: reset module state between cases. */
export function resetDispatchSemaphoreForTests(): void {
  slotsInUse = 0;
  waiters.length = 0;
}
