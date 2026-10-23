import type { BackendHealthState } from "@editor/types/backendHealth";

export function useBackendHealth(): BackendHealthState {
  return {
    status: "healthy",
    message: null,
    error: null,
    isOnline: true,
  };
}
