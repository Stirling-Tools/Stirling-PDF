// AI-engine flag from the backend's public app-config. Gates Classification
// setup: the card always shows but can't be enabled until the engine is on.
// `loading` lets callers hold the decision rather than flash a locked card.

import { apiClient } from "@portal/api/http";
import { useAsync } from "@portal/hooks/useAsync";

interface AppConfigShape {
  aiEngineEnabled?: boolean;
}

export interface AiEngineState {
  enabled: boolean;
  loading: boolean;
}

export function useAiEngineEnabled(): AiEngineState {
  const state = useAsync<AppConfigShape>(
    () => apiClient.local.json<AppConfigShape>("/api/v1/config/app-config"),
    [],
  );
  return {
    enabled: Boolean(state.data?.aiEngineEnabled),
    loading: state.loading && state.data === null,
  };
}
