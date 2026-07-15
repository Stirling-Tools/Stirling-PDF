// Proprietary override of the classification-enabled seam: classification is
// available on every proprietary-based build (self-hosted, SaaS, desktop),
// regardless of AI. The classify policy labels files server-side - via the AI
// engine when it's on, or the non-AI heuristic when it's off - and the sidebar
// groups by the labels written to each file's metadata. Pure core keeps it off.

export function useClassificationEnabled(): boolean {
  return true;
}
