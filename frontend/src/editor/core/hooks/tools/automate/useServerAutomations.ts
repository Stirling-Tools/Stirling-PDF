import { useEffect, useMemo, useState } from "react";
import apiClient from "@editor/services/apiClient";
import { SuggestedAutomation } from "@editor/types/automation";
import { ToolRegistry } from "@editor/data/toolsTaxonomy";
import { parseAutomationFile } from "@editor/utils/automationConverter";

interface ServerPipelineConfig {
  json: string;
  name: string;
}

interface PipelineDataResponse {
  pipelineConfigsWithNames?: ServerPipelineConfig[];
}

export interface ServerAutomations {
  automations: SuggestedAutomation[];
  loadFailed: boolean;
}

/** Automations an admin placed in the server's pipeline/defaultWebUIConfigs folder. */
export function useServerAutomations(
  toolRegistry: Partial<ToolRegistry>,
): ServerAutomations {
  const [configs, setConfigs] = useState<ServerPipelineConfig[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<PipelineDataResponse>("/api/v1/ui-data/pipeline", {
        suppressErrorToast: true,
      })
      .then((response) => {
        if (!cancelled)
          setConfigs(response.data?.pipelineConfigsWithNames ?? []);
      })
      .catch((err) => {
        console.warn("Failed to load server automations:", err);
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const automations = useMemo(() => {
    const now = new Date().toISOString();
    return configs.flatMap((config, index): SuggestedAutomation[] => {
      // The endpoint returns an empty-json placeholder when the folder is empty
      if (!config.json) return [];
      try {
        const { automation } = parseAutomationFile(config.json, toolRegistry);
        return [
          {
            ...automation,
            id: `server-${index}`,
            name: config.name || automation.name,
            icon: "server",
            createdAt: now,
            updatedAt: now,
          },
        ];
      } catch (err) {
        console.warn(`Skipping server automation "${config.name}":`, err);
        return [];
      }
    });
  }, [configs, toolRegistry]);

  return { automations, loadFailed };
}
