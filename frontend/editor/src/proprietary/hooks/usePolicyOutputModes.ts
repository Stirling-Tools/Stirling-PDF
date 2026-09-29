import { availableOutputModes } from "@app/policies/outputModes";

/** Destination types supported by the connected processing backend. */
export function usePolicyOutputModes() {
  return availableOutputModes();
}
