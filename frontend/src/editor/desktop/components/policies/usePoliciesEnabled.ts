import { useConnectedServer } from "@app/hooks/useConnectedServer";
import { useLocalProcessingOnly } from "@app/hooks/useLocalProcessingOnly";

/** Automation requires a confirmed server connection and session. */
export function usePoliciesEnabled(): boolean {
  const connected = useConnectedServer();
  const localOnly = useLocalProcessingOnly();
  return connected && !localOnly;
}
