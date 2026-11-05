import { availableOutputModes } from "@editor/policies/outputModes";

/** Destination types supported by the connected processing backend. */
export function usePolicyOutputModes() {
  return availableOutputModes();
}
