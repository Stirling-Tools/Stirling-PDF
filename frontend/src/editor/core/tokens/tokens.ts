/**
 * Subscription tier identifier.
 *
 * Defined here rather than in the portal because shared/data/endpoints.ts needs
 * it for tier-availability gating, and the shared layer can't import from the
 * portal. The portal UI keeps its own matching `Tier` in
 * contexts/TierContext.tsx.
 *
 * The design tokens themselves live in tokens.css as CSS custom properties —
 * that is the single runtime source of truth. A parallel TS mirror of the
 * palette used to live here but was removed: nothing consumed it and it had
 * silently drifted from the CSS.
 */
export type Tier = "free" | "pro" | "enterprise";
