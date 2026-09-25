import type { ReactNode } from "react";

/** Content replacing the workbench canvas (not the rails), for a flow that must own it
 *  until it finishes. A registered view cannot: unregistering ejects the user mid-run. */
export function useWorkbenchTakeover(): ReactNode | null {
  return null;
}
