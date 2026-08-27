import { useProcessorEnabled } from "@app/hooks/useProcessorEnabled";

export function usePoliciesEnabled(): boolean {
  return useProcessorEnabled();
}
