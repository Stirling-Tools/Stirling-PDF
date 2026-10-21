import { useEffect, useMemo, useState } from "react";
import apiClient from "@app/services/apiClient";
import { SuggestedAutomation } from "@app/types/automation";
import { ToolRegistry } from "@app/data/toolsTaxonomy";
import { parseAutomationFile } from "@app/utils/automationConverter";

interface ServerPipelineConfig {
  json: string;
  name: string;
}

interface PipelineDataResponse {
  pipelineConfigsWithNames?: ServerPipelineConfig[];
}

/** Automations an admin placed in the server's pipeline/defaultWebUIConfigs folder. */
export function useServerAutomations(
  toolRegistry: Partial<ToolRegistry>,
): SuggestedAutomation[] {
  const [configs, setConfigs] = useState<ServerPipelineConfig[]>([]);

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
      .catch((err) => console.warn("Failed to load server automations:", err));
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
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
}
