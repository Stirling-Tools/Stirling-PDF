import { useConfirmedSaaSMode } from "@editor/hooks/useConfirmedSaaSMode";

export function usePoliciesEnabled(): boolean {
  return useConfirmedSaaSMode();
}
