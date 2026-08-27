import { useConfirmedSaaSMode } from "@app/hooks/useConfirmedSaaSMode";
import { useProcessorEnabled } from "@app/hooks/useProcessorEnabled";

export function usePoliciesEnabled(): boolean {
  const saasMode = useConfirmedSaaSMode();
  const processorEnabled = useProcessorEnabled();
  return saasMode && processorEnabled;
}
