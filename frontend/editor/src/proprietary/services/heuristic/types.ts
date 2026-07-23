// Shared types for the client-side heuristic (non-AI) document classifier.

/** Input document for the heuristic engine. */
export interface HeuristicDoc {
  fileName: string;
  pageCount: number;
  meta: Record<string, string>;
  titleZone: string;
  firstZone: string;
  allZone: string;
}

// "none" = no match or non-English; a real runtime value, not just a type state.
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
