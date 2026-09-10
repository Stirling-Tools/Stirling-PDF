// Shared types for the client-side heuristic (non-AI) document classifier.

import type { ClassificationConfidence } from "@app/types/fileContext";

/** Input document for the heuristic engine. */
export interface HeuristicDoc {
  fileName: string;
  pageCount: number;
  meta: Record<string, string>;
  titleZone: string;
  firstZone: string;
  allZone: string;
}

// "none" = no label cleared the floor; a real runtime value, not just a type state.
export type HeuristicConfidence = ClassificationConfidence;

/** One language the text scored for, on the detector's own scale. */
export interface LanguageCandidate {
  language: string;
  score: number;
}

/** What the detector concluded about a document's language. */
export interface LanguageDetection {
  /** Best tag (ISO 639-1, region-free), or null when the text proves nothing. */
  language: string | null;
  /** Writing system: a script id from `languages.json`, "latin", or null. */
  script: string | null;
  /** Ranked candidates, best first — what pack dispatch reads. */
  candidates: LanguageCandidate[];
  /** English assumed with no positive evidence (data-dense text: tickets, forms). */
  assumed: boolean;
  /** Fewer than 30 words — too little prose for a confident language call. */
  lowText: boolean;
}

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
  language: string | null;
  script: string | null;
  assumed: boolean;
  lowText: boolean;
  /** Language packs whose rules were merged in; empty for core-only scoring. */
  packs: string[];
  languageCandidates: LanguageCandidate[];
  /** Top candidates by score, best first. */
  candidates: LabelScoreExplanation[];
}

/** Classification outcome: emitted vocabulary label ids (primary first, capped at 5). */
export interface HeuristicResult {
  labels: string[];
  confidence: HeuristicConfidence;
  score: number;
  /** Detected document language; null when the text proved nothing. */
  language: string | null;
  /**
   * Packs that contributed rules. Empty means the document was scored against
   * the language-neutral core alone, which caps confidence below "high".
   */
  packs: string[];
  /** Present only when classify was called with `{ explain: true }`. */
  explain?: HeuristicExplanation;
}
