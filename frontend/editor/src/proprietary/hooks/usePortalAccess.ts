import { useAuth } from "@app/auth/context";
import type { PortalAccessState } from "@core/hooks/usePortalAccess";

export type { PortalAccessState };

/**
 * Self-hosted (and desktop): the Spring session carries `portalAccess`, so the
 * shared auth context is both the answer and the settled signal. See the core
 * seam for the contract.
 */
export function usePortalAccessState(): PortalAccessState {
  const { portalAccess, loading } = useAuth();
  return { granted: portalAccess === true, settled: !loading };
}

export function usePortalAccess(): boolean {
  return usePortalAccessState().granted;
}
