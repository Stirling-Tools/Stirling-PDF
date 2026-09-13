import { useAuth } from "@app/auth/context";
import type { ProcessorAccessState } from "@core/hooks/useProcessorAccess";

export type { ProcessorAccessState };

/**
 * Self-hosted (and desktop): the Spring session carries `processorAccess`, so the
 * shared auth context is both the answer and the settled signal. See the core
 * seam for the contract.
 */
export function useProcessorAccessState(): ProcessorAccessState {
  const { processorAccess, loading } = useAuth();
  return { granted: processorAccess === true, settled: !loading };
}

export function useProcessorAccess(): boolean {
  return useProcessorAccessState().granted;
}
