import { availableOutputModes } from "@app/policies/outputModes";
import { useSaaSMode } from "@app/hooks/useSaaSMode";

/** Destination types follow the desktop's connected processing backend. */
export function usePolicyOutputModes() {
  return availableOutputModes(useSaaSMode());
}
