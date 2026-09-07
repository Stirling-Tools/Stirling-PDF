/**
 * Opens the plan surface behind the sidebar footer's free-credits row, or null
 * when this build has none (the row is then inert text rather than a button).
 *
 * Core ships no wallet and no plan section, so there is nothing to open. Builds
 * that meter usage override this with their own surface.
 */
export function useOpenPlan(): (() => void) | null {
  return null;
}
