// Shared types for the client-side heuristic (non-AI) document classifier.
// Faithful port of the backend HeuristicClassifier.java records.

/** Input document for the heuristic engine (mirrors Java HeuristicDoc). */
export interface HeuristicDoc {
  fileName: string;
  pageCount: number;
  meta: Record<string, string>;
  titleZone: string;
  firstZone: string;
  allZone: string;
}

// "none" mirrors the Java engine's no-match / non-English confidence and must
// stay a runtime value; dropping it would diverge from HeuristicClassifier.java.
export type HeuristicConfidence = "none" | "low" | "medium" | "high";

/** Classification outcome: emitted vocabulary label ids (primary first, capped at 5). */
export interface HeuristicResult {
  labels: string[];
  confidence: HeuristicConfidence;
  score: number;
  isEnglish: boolean;
}
