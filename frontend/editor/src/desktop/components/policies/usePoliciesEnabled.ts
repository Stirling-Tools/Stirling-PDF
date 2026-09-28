import { useConnectedServer } from "@app/hooks/useConnectedServer";

/** Automation requires a confirmed server connection and session. */
export function usePoliciesEnabled(): boolean {
  return useConnectedServer();
}
