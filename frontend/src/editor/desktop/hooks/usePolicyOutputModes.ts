import { availableOutputModes } from "@editor/policies/outputModes";
import { useSaaSMode } from "@editor/hooks/useSaaSMode";

/** Destination types follow the desktop's connected processing backend. */
export function usePolicyOutputModes() {
  return availableOutputModes(useSaaSMode());
}
