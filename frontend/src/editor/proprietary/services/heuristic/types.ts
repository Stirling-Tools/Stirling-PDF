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

export interface LanguageCandidate {
  language: string;
  score: number;
}

export interface LanguageDetection {
  language: string | null;
  script: string | null;
  candidates: LanguageCandidate[];
  assumed: boolean;
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
  language: string | null;
  packs: string[];
  /** Present only when classify was called with `{ explain: true }`. */
  explain?: HeuristicExplanation;
}
