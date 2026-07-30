import { useConfirmedSaaSMode } from "@app/hooks/useConfirmedSaaSMode";

export function usePoliciesEnabled(): boolean {
  return useConfirmedSaaSMode();
}
