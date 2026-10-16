import { ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import { ToolId } from "@app/types/toolId";
import type { ToolAvailabilityMap } from "@app/hooks/useToolManagement";

/**
 * Why a tool can't be used right now, and the label shown for it. Pure, so
 * every surface that lists tools (tool panels, search) can agree on it.
 */
export type ToolDisabledReason =
  | "comingSoon"
  | "disabledByAdmin"
  | "missingDependency"
  | "unknownUnavailable"
  | "requiresPremium"
  | "selfHostedOffline"
  | null;

export const getToolDisabledReason = (
  id: string,
  tool: ToolRegistryEntry,
  toolAvailability?: ToolAvailabilityMap,
  premiumEnabled?: boolean,
): ToolDisabledReason => {
  if (!tool.component && !tool.link && id !== "read" && id !== "multiTool") {
    return "comingSoon";
  }

  // Check if tool requires premium but premium is not enabled
  if (tool.requiresPremium === true && premiumEnabled !== true) {
    return "requiresPremium";
  }

  const availabilityInfo = toolAvailability?.[id as ToolId];
  if (availabilityInfo && availabilityInfo.available === false) {
    if (availabilityInfo.reason === "selfHostedOffline") {
      return "selfHostedOffline";
    }
    if (availabilityInfo.reason === "missingDependency") {
      return "missingDependency";
    }
    if (availabilityInfo.reason === "disabledByAdmin") {
      return "disabledByAdmin";
    }
    return "unknownUnavailable";
  }

  return null;
};

const AVAILABILITY_REASONS: ToolDisabledReason[] = [
  "disabledByAdmin",
  "missingDependency",
  "unknownUnavailable",
];

/** Per-tool override for availability-driven disabled labels, else the generic one. */
export const resolveDisabledMessage = (
  t: (key: string, fallback: string) => string,
  disabledReason: ToolDisabledReason,
  tool: ToolRegistryEntry,
): string => {
  if (
    tool.unavailableMessage &&
    AVAILABILITY_REASONS.includes(disabledReason)
  ) {
    return tool.unavailableMessage;
  }
  const { key, fallback } = getDisabledLabel(disabledReason);
  return t(key, fallback);
};

export const getDisabledLabel = (
  disabledReason: ToolDisabledReason,
): { key: string; fallback: string } => {
  if (disabledReason === "requiresPremium") {
    return {
      key: "toolPanel.premiumFeature",
      fallback: "Premium feature:",
    };
  }
  if (disabledReason === "selfHostedOffline") {
    return {
      key: "toolPanel.fullscreen.selfHostedOffline",
      fallback: "Requires your Stirling-PDF server (currently offline):",
    };
  }
  if (disabledReason === "missingDependency") {
    return {
      key: "toolPanel.fullscreen.unavailableDependency",
      fallback: "Unavailable - required tool missing on server:",
    };
  }
  if (
    disabledReason === "disabledByAdmin" ||
    disabledReason === "unknownUnavailable"
  ) {
    return {
      key: "toolPanel.fullscreen.unavailable",
      fallback: "Disabled by server administrator:",
    };
  }
  return {
    key: "toolPanel.fullscreen.comingSoon",
    fallback: "Coming soon:",
  };
};
