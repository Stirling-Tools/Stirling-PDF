import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useUnavailableToolFallback } from "@app/hooks/useUnavailableToolFallback";
import type { ToolAvailabilityMap } from "@app/hooks/useToolManagement";
import type { ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import type { ToolId } from "@app/types/toolId";
import {
  getToolDisabledReason,
  resolveDisabledMessage,
} from "@app/utils/toolDisabledReason";

/**
 * How search may offer a tool, mirroring the tool list: what the list leaves
 * out is hidden, what it greys out is shown disabled with the list's reason,
 * and what it opens despite being unavailable (desktop's cloud fallback)
 * opens past the availability guard.
 */
export type ToolSearchAccess =
  | { kind: "hidden" }
  | { kind: "open" }
  | { kind: "openForced" }
  | { kind: "disabled"; message: string };

export type ToolSearchAccessResolver = (
  id: ToolId,
  tool: ToolRegistryEntry,
) => ToolSearchAccess;

export function resolveToolSearchAccess(
  id: ToolId,
  tool: ToolRegistryEntry,
  toolAvailability: ToolAvailabilityMap,
  options: {
    premiumEnabled: boolean | undefined;
    unavailableFallback: boolean;
    t: TFunction;
  },
): ToolSearchAccess {
  if (tool.hiddenFromToolList) return { kind: "hidden" };
  const reason = getToolDisabledReason(
    id,
    tool,
    toolAvailability,
    options.premiumEnabled,
  );
  if (reason === null) return { kind: "open" };
  if (reason === "comingSoon") return { kind: "hidden" };
  if (options.unavailableFallback && reason !== "selfHostedOffline") {
    return { kind: "openForced" };
  }
  return {
    kind: "disabled",
    message: resolveDisabledMessage(options.t, reason, tool),
  };
}

export function useToolSearchAccess(
  toolAvailability: ToolAvailabilityMap,
): ToolSearchAccessResolver {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const premiumEnabled = config?.premiumEnabled;
  const unavailableFallback = useUnavailableToolFallback();
  return useCallback(
    (id, tool) =>
      resolveToolSearchAccess(id, tool, toolAvailability, {
        premiumEnabled,
        unavailableFallback,
        t,
      }),
    [toolAvailability, premiumEnabled, unavailableFallback, t],
  );
}
