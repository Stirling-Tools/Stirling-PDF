import { useSyncExternalStore } from "react";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import type { ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import {
  getAcknowledgedToolVersions,
  getToolFreshness,
  isToolFreshnessAcknowledged,
  subscribeToolFreshness,
  type ToolFreshnessBadge,
} from "@app/utils/toolFreshness";

// "New"/"Updated" badge for a tool; null once the tagged release is no longer
// recent or the user already opened the tool at that version.
export function useToolFreshnessBadge(
  toolId: string,
  tool: Pick<ToolRegistryEntry, "newInVersion" | "updatedInVersion">,
): ToolFreshnessBadge | null {
  const { config } = useAppConfig();
  const acknowledged = useSyncExternalStore(
    subscribeToolFreshness,
    getAcknowledgedToolVersions,
    getAcknowledgedToolVersions,
  );
  const freshness = getToolFreshness(tool, config?.appVersion);
  if (!freshness) return null;
  if (isToolFreshnessAcknowledged(acknowledged, toolId, freshness.version)) {
    return null;
  }
  return freshness.badge;
}
