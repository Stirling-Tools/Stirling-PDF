/**
 * Serializes main-thread PDFium scans.
 *
 * PDFium is single-threaded and wasm memory never shrinks. Two scans of
 * different documents would each open a full copy in the heap and leave the
 * sum as the high-water mark, so scans run in submission order.
 */
let tail: Promise<unknown> = Promise.resolve();

export function runPdfiumScan<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.catch(() => undefined);
  return run;
}
