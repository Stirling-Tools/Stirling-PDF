/**
 * Serializes main-thread PDFium scans.
 *
 * PDFium is single-threaded and wasm memory never shrinks. Every scan copies
 * the whole document into the heap, so running them concurrently multiplies
 * that copy and pushes the heap high-water mark up without finishing any
 * sooner. Queued scans run in submission order.
 */
let tail: Promise<unknown> = Promise.resolve();

export function runPdfiumScan<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.catch(() => undefined);
  return run;
}
