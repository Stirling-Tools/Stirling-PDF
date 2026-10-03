import type { ReactNode } from "react";

/** Platform hosts mounted inside the signed-in provider tree, beside the workbench. */
export function AppHostExtensions(): ReactNode {
  return null;
}

/**
 * The platform's startup update prompt. AppProviders renders the result in both its
 * loading and signed-in trees, and calls this once at its top so the prompt's state
 * survives the switch between them.
 */
export function useUpdatePopupModal(): ReactNode {
  return null;
}
