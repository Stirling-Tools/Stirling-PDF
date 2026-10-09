import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@app/services/apiClient";
import { useAuth } from "@app/auth/context";
import { useConnectionMode } from "@app/hooks/useConnectionMode";
import { useConnectedServerState } from "@app/hooks/useConnectedServer";
import {
  connectionIdentityKey,
  subscribeToConnectionIdentity,
} from "@app/services/connectionIdentity";
import type { PortalAccessState } from "@core/hooks/usePortalAccess";

export type { PortalAccessState };

async function fetchCloudPortalAccess(): Promise<boolean> {
  const response = await apiClient.get<{ user?: { portalAccess?: boolean } }>(
    "/api/v1/auth/me",
    { suppressErrorToast: true, skipAuthRedirect: true },
  );
  return response.data.user?.portalAccess === true;
}

/**
 * Whether the signed-in account can open the processor on the connected server.
 * A self-hosted session carries the flag from its own /me. A Stirling Cloud
 * session is built without /me, so the flag is asked for here, per account.
 * Local mode has no processor.
 */
export function usePortalAccessState(): PortalAccessState {
  const mode = useConnectionMode();
  const server = useConnectedServerState();
  const connected = server.connected;
  const { portalAccess, loading } = useAuth();
  const identity = useSyncExternalStore(
    subscribeToConnectionIdentity,
    connectionIdentityKey,
  );
  const cloud = mode === "saas" && connected;
  const { data, isFetched, isFetching } = useQuery({
    queryKey: ["desktop", "portalAccess", identity],
    queryFn: fetchCloudPortalAccess,
    enabled: cloud,
    // Unreachable or signed out means no access now; a later mount asks again.
    retry: false,
  });

  // Not signed in yet reads as signed out, so nothing is decided before the session is read.
  if (!server.settled) return { granted: false, settled: false };
  if (mode === "saas") {
    return {
      granted: cloud && data === true,
      settled: !cloud || (isFetched && !isFetching),
    };
  }
  if (mode === "selfhosted") {
    return { granted: connected && portalAccess === true, settled: !loading };
  }
  return { granted: false, settled: mode !== null };
}

export function usePortalAccess(): boolean {
  return usePortalAccessState().granted;
}
