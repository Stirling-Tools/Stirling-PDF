// Resolve a classification label id to a human display name. Classification is a
// SaaS-only feature, so the core build has no vocabulary and returns the id
// unchanged; the proprietary build overrides this to map ids to (translatable)
// names. Core files never carry classification labels, so the identity fallback
// is never actually rendered here.

/** Returns a resolver mapping a label id to its display name. */
export function useLabelName(): (id: string) => string {
  return (id) => id;
}
