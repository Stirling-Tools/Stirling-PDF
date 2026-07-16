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

/** One scored candidate label with the rule hits that produced its score (debug only). */
export interface LabelScoreExplanation {
  id: string;
  emit: boolean;
  score: number;
  distinct: number;
  /** Human-readable contributions, e.g. `phrase "tax invoice" +60 (title)`. */
  signals: string[];
}

/** Why a document scored the way it did; produced only when explain is requested. */
export interface HeuristicExplanation {
  isEnglish: boolean;
  lowText: boolean;
  /** Top candidates by score, best first. Empty when rejected as non-English. */
  candidates: LabelScoreExplanation[];
}

/** Classification outcome: emitted vocabulary label ids (primary first, capped at 5). */
export interface HeuristicResult {
  labels: string[];
  confidence: HeuristicConfidence;
  score: number;
  isEnglish: boolean;
  /** Present only when classify was called with `{ explain: true }`. */
  explain?: HeuristicExplanation;
}
