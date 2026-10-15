/**
 * How long one run of a tool took, for comparing a TS tool with its Rust
 * counterpart, and the Rust code in the browser with the same code on the
 * server.
 */
export interface ToolTiming {
  /** The tool family, shared by a TS tool and its Rust counterpart. */
  tool: string;
  implementation: "typescript" | "rust";
  location: "browser" | "server";
  files: number;
  /** Wall clock for the whole run; on the server this includes upload and download. */
  totalMs: number;
  /**
   * Server only: time the server spent on the files, summed from each
   * response's Server-Timing header. Null when a header was missing or not
   * readable (a cross-origin backend that does not expose it).
   */
  serverProcessingMs: number | null;
}

const TIMING_EVENT = "stirling:tool-timing";

export function emitTiming(timing: ToolTiming): void {
  window.dispatchEvent(new CustomEvent(TIMING_EVENT, { detail: timing }));
}

/** Calls `callback` with each timing from `implementation` of `tool`. */
export function onTiming(
  tool: string,
  implementation: ToolTiming["implementation"],
  callback: (timing: ToolTiming) => void,
): () => void {
  const handler = (event: Event) => {
    const timing = (event as CustomEvent<ToolTiming>).detail;
    if (timing.tool === tool && timing.implementation === implementation) {
      callback(timing);
    }
  };
  window.addEventListener(TIMING_EVENT, handler);
  return () => window.removeEventListener(TIMING_EVENT, handler);
}

/** The `process` metric's duration from a Server-Timing header, in ms. */
export function parseServerTiming(header: unknown): number | null {
  if (typeof header !== "string") return null;
  const metric = header
    .split(",")
    .map((entry) => entry.trim())
    .find((entry) => entry.split(";")[0].trim() === "process");
  const duration = metric?.match(/;\s*dur=([\d.]+)/)?.[1];
  return duration === undefined ? null : Number(duration);
}

/** Null as soon as one response lacks a readable Server-Timing header. */
export function addServerTime(
  total: number | null,
  processingMs: number | null,
): number | null {
  return total === null || processingMs === null ? null : total + processingMs;
}
