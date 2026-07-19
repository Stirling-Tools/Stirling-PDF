// Proprietary override of the classification-enabled seam: classification is
// available on every proprietary-based build (self-hosted, SaaS, desktop),
// regardless of AI. The classify policy labels files server-side when the AI
// engine is on; otherwise the in-browser heuristic engine labels them, and the
// sidebar groups by the labels on each file. Pure core keeps it off.

export function useClassificationEnabled(): boolean {
  return true;
}
