import { useConnectedServer } from "@app/hooks/useConnectedServer";

export function usePoliciesEnabled(): boolean {
  return useConnectedServer();
}
