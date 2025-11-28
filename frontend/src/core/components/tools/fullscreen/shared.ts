import { useHotkeys } from '@app/contexts/HotkeyContext';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { ToolRegistryEntry } from '@app/data/toolsTaxonomy';
import { ToolId } from '@app/types/toolId';
import type { ToolAvailabilityMap } from '@app/hooks/useToolManagement';
import { useAppConfig } from '@app/contexts/AppConfigContext';

export const getItemClasses = (isDetailed: boolean): string => {
  return isDetailed ? 'tool-panel__fullscreen-item--detailed' : '';
};

export const getIconBackground = (categoryColor: string, isDetailed: boolean): string => {
  const baseColor = isDetailed ? 'var(--fullscreen-bg-icon-detailed)' : 'var(--fullscreen-bg-icon-compact)';
  const blend1 = isDetailed ? '18%' : '15%';
  const blend2 = isDetailed ? '8%' : '6%';

  return `linear-gradient(135deg,
    color-mix(in srgb, ${categoryColor} ${blend1}, ${baseColor}),
    color-mix(in srgb, ${categoryColor} ${blend2}, ${baseColor})
  )`;
};

export const getIconStyle = (): Record<string, string> => {
  return {};
};

export type ToolDisabledReason = 'comingSoon' | 'disabledByAdmin' | 'missingDependency' | 'unknownUnavailable' | 'requiresPremium' | null;

export const getToolDisabledReason = (
  id: string,
  tool: ToolRegistryEntry,
  toolAvailability?: ToolAvailabilityMap,
  premiumEnabled?: boolean
): ToolDisabledReason => {
  if (!tool.component && !tool.link && id !== 'read' && id !== 'multiTool') {
    return 'comingSoon';
  }

  // Check if tool requires premium but premium is not enabled
  if (tool.requiresPremium === true && premiumEnabled !== true) {
    return 'requiresPremium';
  }

  const availabilityInfo = toolAvailability?.[id as ToolId];
  if (availabilityInfo && availabilityInfo.available === false) {
    if (availabilityInfo.reason === 'missingDependency') {
      return 'missingDependency';
    }
    if (availabilityInfo.reason === 'disabledByAdmin') {
      return 'disabledByAdmin';
    }
    return 'unknownUnavailable';
  }

  return null;
};

export const getDisabledLabel = (
  disabledReason: ToolDisabledReason
): { key: string; fallback: string } => {
  if (disabledReason === 'requiresPremium') {
    return {
      key: 'toolPanel.premiumFeature',
      fallback: 'Premium feature:'
    };
  }
  if (disabledReason === 'missingDependency') {
    return {
      key: 'toolPanel.fullscreen.unavailableDependency',
      fallback: 'Unavailable - required tool missing on server:'
    };
  }
  if (disabledReason === 'disabledByAdmin' || disabledReason === 'unknownUnavailable') {
    return {
      key: 'toolPanel.fullscreen.unavailable',
      fallback: 'Disabled by server administrator:'
    };
  }
  return {
    key: 'toolPanel.fullscreen.comingSoon',
    fallback: 'Coming soon:'
  };
};

export function useToolMeta(id: string, tool: ToolRegistryEntry) {
  const { hotkeys } = useHotkeys();
  const { isFavorite, toggleFavorite, toolAvailability } = useToolWorkflow();
  const { config } = useAppConfig();
  const premiumEnabled = config?.premiumEnabled;

  const isFav = isFavorite(id as ToolId);
  const binding = hotkeys[id as ToolId];
  const disabledReason = getToolDisabledReason(id, tool, toolAvailability, premiumEnabled);
  const disabled = disabledReason !== null;

  return {
    binding,
    isFav,
    toggleFavorite: () => toggleFavorite(id as ToolId),
    disabled,
    disabledReason,
  };
}


