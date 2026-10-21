/** One language the detector scored, best first. */
export interface LanguageCandidate {
  language: string;
  score: number;
}

/**
 * Result of identifying the language of a block of extracted text.
 *
 * `language` is a region-free ISO 639-1 code, or null when the text carries no
 * usable evidence. `assumed` marks English reached by the absence of another
 * language rather than by its own vocabulary, so callers can present it as a
 * guess instead of a detection.
 */
export interface LanguageDetection {
  language: string | null;
  script: string | null;
  candidates: LanguageCandidate[];
  assumed: boolean;
  lowText: boolean;
}
