// AI-engine flag from the backend's public app-config. Gates Classification
// setup: the card always shows but can't be enabled until the engine is on.
// `loading` lets callers hold the decision rather than flash a locked card.

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@portal/api/http";
import { qk } from "@portal/queries/keys";

interface AppConfigShape {
  aiEngineEnabled?: boolean;
}

export interface AiEngineState {
  enabled: boolean;
  loading: boolean;
}

export function useAiEngineEnabled(): AiEngineState {
  const query = useQuery({
    queryKey: qk.appConfig(),
    queryFn: () =>
      apiClient.local.json<AppConfigShape>("/api/v1/config/app-config"),
  });
  return {
    enabled: Boolean(query.data?.aiEngineEnabled),
    loading: query.isPending,
  };
}
