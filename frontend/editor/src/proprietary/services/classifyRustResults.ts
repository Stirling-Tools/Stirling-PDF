import type { HeuristicResult } from "@app/services/heuristic/types";
import type { RulesVerdict } from "@app/services/rulesClassifier";

/** One file's verdicts from the Rust classifier and the TypeScript heuristic it replaces. */
export interface ClassifyRustResult {
  fileName: string;
  /** Null when the server's verdict header was not readable (a cross-origin backend). */
  rust: RulesVerdict | null;
  /** Null when the heuristic could not read the file. */
  typescript: HeuristicResult | null;
}

const RESULTS_EVENT = "stirling:classify-rust-results";

export function emitResults(results: ClassifyRustResult[]): void {
  window.dispatchEvent(new CustomEvent(RESULTS_EVENT, { detail: results }));
}

export function onResults(
  callback: (results: ClassifyRustResult[]) => void,
): () => void {
  const handler = (event: Event) =>
    callback((event as CustomEvent<ClassifyRustResult[]>).detail);
  window.addEventListener(RESULTS_EVENT, handler);
  return () => window.removeEventListener(RESULTS_EVENT, handler);
}
