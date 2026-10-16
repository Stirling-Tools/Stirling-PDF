import { useHotkeys } from "@app/contexts/HotkeyContext";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import { ToolId } from "@app/types/toolId";
import { useAppConfig } from "@app/contexts/AppConfigContext";

export const getItemClasses = (isDetailed: boolean): string => {
  return isDetailed ? "tool-panel__fullscreen-item--detailed" : "";
};

export const getIconBackground = (
  categoryColor: string,
  isDetailed: boolean,
): string => {
  const baseColor = isDetailed
    ? "var(--fullscreen-bg-icon-detailed)"
    : "var(--fullscreen-bg-icon-compact)";
  const blend1 = isDetailed ? "18%" : "15%";
  const blend2 = isDetailed ? "8%" : "6%";

  return `linear-gradient(135deg,
    color-mix(in srgb, ${categoryColor} ${blend1}, ${baseColor}),
    color-mix(in srgb, ${categoryColor} ${blend2}, ${baseColor})
  )`;
};

export const getIconStyle = (): Record<string, string> => {
  return {};
};

export {
  getToolDisabledReason,
  resolveDisabledMessage,
  getDisabledLabel,
  type ToolDisabledReason,
} from "@app/utils/toolDisabledReason";
import { getToolDisabledReason } from "@app/utils/toolDisabledReason";

export function useToolMeta(id: string, tool: ToolRegistryEntry) {
  const { hotkeys } = useHotkeys();
  const { isFavorite, toggleFavorite, toolAvailability } = useToolWorkflow();
  const { config } = useAppConfig();
  const premiumEnabled = config?.premiumEnabled;

  const isFav = isFavorite(id as ToolId);
  const binding = hotkeys[id as ToolId];
  const disabledReason = getToolDisabledReason(
    id,
    tool,
    toolAvailability,
    premiumEnabled,
  );
  const disabled = disabledReason !== null;

  return {
    binding,
    isFav,
    toggleFavorite: () => toggleFavorite(id as ToolId),
    disabled,
    disabledReason,
  };
}
