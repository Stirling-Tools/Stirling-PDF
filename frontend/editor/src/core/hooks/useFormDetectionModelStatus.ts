import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import apiClient from "@app/services/apiClient";
import { qk } from "@app/query/keys";

export interface FormDetectionCatalogEntry {
  id: string;
  displayName: string;
  description: string;
  license: string;
  sizeBytes: number;
  onnxUrl: string;
  sha256: string;
}

export type FormDetectionState =
  | "not_installed"
  | "downloading"
  | "verifying"
  | "ready"
  | "failed";

export interface FormDetectionModelStatus {
  status: FormDetectionState;
  progress: number;
  activeModelId: string;
  installed: string[];
  error: string | null;
  writable: boolean;
  catalog: FormDetectionCatalogEntry[];
  enabled: boolean;
  serverEngineAvailable: boolean;
  downloadingModelId?: string | null;
}

const STATUS_URL = "/api/v1/form/form-detection-model/status";
const INSTALL_URL = "/api/v1/form/form-detection-model/install";
const CONFIG_URL = "/api/v1/form/form-detection-model/config";
const MODEL_URL = "/api/v1/form/form-detection-model";

/** How often to re-read progress while a model is downloading or verifying. */
const POLL_MS = 1500;

/**
 * Polls model status while an install is in flight and exposes the admin actions. Readiness flips
 * invalidate the endpoint-availability cache so the tool tile enables/disables.
 *
 * The poll pauses while the tab is hidden - a download nobody is watching stops being
 * narrated, and the next tick on return carries the invalidation the tile needs.
 */
export function useFormDetectionModelStatus() {
  const queryClient = useQueryClient();
  const queryKey = qk.formDetectionModelStatus();

  const {
    data: status = null,
    isPending,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async () =>
      (await apiClient.get<FormDetectionModelStatus>(STATUS_URL)).data,
    refetchInterval: ({ state }) =>
      state.data?.status === "downloading" || state.data?.status === "verifying"
        ? POLL_MS
        : false,
  });

  const active = status?.status;
  const featureEnabled = status?.enabled;

  // Readiness and the master switch both gate the endpoint, so either flipping must refresh
  // the tool availability cache.
  useEffect(() => {
    if (active === "ready" || active === "not_installed") {
      void queryClient.invalidateQueries({
        queryKey: qk.endpointsAvailability(),
      });
      void queryClient.invalidateQueries({
        queryKey: qk.endpointEnabled("form-detection"),
      });
    }
  }, [active, featureEnabled, queryClient]);

  /** Each write re-reads status, so the caller's await settles on the new state. */
  const afterWrite = () => queryClient.invalidateQueries({ queryKey });

  const install = useMutation({
    mutationFn: (modelId: string) => apiClient.post(INSTALL_URL, { modelId }),
    onSuccess: afterWrite,
  });

  const uninstall = useMutation({
    mutationFn: (modelId?: string) =>
      apiClient.delete(
        modelId
          ? `${MODEL_URL}?modelId=${encodeURIComponent(modelId)}`
          : MODEL_URL,
      ),
    onSuccess: afterWrite,
  });

  const setConfig = useMutation({
    mutationFn: (config: { enabled?: boolean }) =>
      apiClient.post(CONFIG_URL, config),
    onSuccess: afterWrite,
  });

  return {
    status,
    loading: isPending,
    error: queryError
      ? queryError instanceof Error
        ? queryError.message
        : "Failed to load model status"
      : null,
    refetch: async () => {
      await refetch();
    },
    install: install.mutateAsync,
    uninstall: uninstall.mutateAsync,
    setConfig: setConfig.mutateAsync,
  };
}
