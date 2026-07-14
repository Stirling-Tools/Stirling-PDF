import { useCallback, useEffect, useState } from "react";
import apiClient from "@app/services/apiClient";
import { invalidateEndpointCache } from "@app/hooks/useEndpointConfig";

export interface FormDetectionCatalogEntry {
  id: string;
  displayName: string;
  description: string;
  license: string;
  sizeBytes: number;
  onnxUrl: string;
  sha256: string;
  // Pipeline spec (parity with the backend ModelCatalogEntry) - drives the in-browser engine.
  inputSize: number;
  resizeMode?: string;
  padColor?: number[];
  channelOrder?: string;
  normMean?: number[];
  normStd?: number[];
  outputLayout?: string;
  hasObjectness?: boolean;
  classNames?: string[];
  classFieldTypes?: string[];
  scoreThreshold?: number;
  nms?: string;
  iou?: number;
}

export type FormDetectionState =
  | "not_installed"
  | "downloading"
  | "verifying"
  | "ready"
  | "failed";

export type FormDetectionExecutionMode = "auto" | "browser" | "server";

export interface FormDetectionModelStatus {
  status: FormDetectionState;
  progress: number;
  activeModelId: string;
  installed: string[];
  error: string | null;
  writable: boolean;
  catalog: FormDetectionCatalogEntry[];
  enabled: boolean;
  executionMode: FormDetectionExecutionMode;
  serverEngineAvailable: boolean;
}

const STATUS_URL = "/api/v1/ai/form-detection-model/status";
const INSTALL_URL = "/api/v1/ai/form-detection-model/install";
const CONFIG_URL = "/api/v1/ai/form-detection-model/config";
const MODEL_URL = "/api/v1/ai/form-detection-model";

/**
 * Polls the Auto Form Detection model status and exposes admin install/uninstall actions.
 * Polling only runs while a download/verify is in flight. When readiness flips, the shared
 * endpoint-availability cache is invalidated so the tool tile re-enables/disables.
 */
export function useFormDetectionModelStatus() {
  const [status, setStatus] = useState<FormDetectionModelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiClient.get<FormDetectionModelStatus>(STATUS_URL);
      setStatus(res.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load model status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const active = status?.status;

  // Poll only while an install is in flight.
  useEffect(() => {
    if (active === "downloading" || active === "verifying") {
      const id = setInterval(fetchStatus, 1500);
      return () => clearInterval(id);
    }
    return undefined;
  }, [active, fetchStatus]);

  // When readiness flips, the tool availability cache must be refreshed.
  useEffect(() => {
    if (active === "ready" || active === "not_installed") {
      invalidateEndpointCache();
    }
  }, [active]);

  const install = useCallback(
    async (modelId: string) => {
      await apiClient.post(INSTALL_URL, { modelId });
      await fetchStatus();
    },
    [fetchStatus],
  );

  const uninstall = useCallback(
    async (modelId?: string) => {
      const url = modelId
        ? `${MODEL_URL}?modelId=${encodeURIComponent(modelId)}`
        : MODEL_URL;
      await apiClient.delete(url);
      await fetchStatus();
    },
    [fetchStatus],
  );

  const setConfig = useCallback(
    async (config: {
      enabled?: boolean;
      executionMode?: FormDetectionExecutionMode;
    }) => {
      await apiClient.post(CONFIG_URL, config);
      await fetchStatus();
    },
    [fetchStatus],
  );

  return {
    status,
    loading,
    error,
    refetch: fetchStatus,
    install,
    uninstall,
    setConfig,
  };
}
