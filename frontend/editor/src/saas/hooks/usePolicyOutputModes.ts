import { availableOutputModes } from "@app/policies/outputModes";

/** Hosted processing can deliver only to remote destinations. */
export function usePolicyOutputModes() {
  return availableOutputModes(true);
}
