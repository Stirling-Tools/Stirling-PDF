// Whether document classification (and everything it drives in the UI: the
// Files-sidebar category grouping, per-file label chips, and the file-details
// Classification section) is active in this build. Pure core has neither the
// AI classify policy nor the proprietary client-side heuristic engine, so it
// returns false and none of that UI ever renders. The proprietary layer
// overrides this to true: the heuristic engine classifies locally, and labels
// written by the classify policy (SaaS, AI on) take precedence over it.

export function useClassificationEnabled(): boolean {
  return false;
}
