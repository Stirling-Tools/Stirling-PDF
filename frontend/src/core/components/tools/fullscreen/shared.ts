import { useHotkeys } from '@app/contexts/HotkeyContext';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { ToolRegistryEntry } from '@app/data/toolsTaxonomy';
import { ToolId } from '@app/types/toolId';
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

export const isToolDisabled = (id: string, tool: ToolRegistryEntry, premiumEnabled?: boolean): boolean => {
  // Check if tool is unavailable (no component and not a link)
  const isUnavailable = !tool.component && !tool.link && id !== 'read' && id !== 'multiTool';
  
  // Check if tool requires premium but premium is not enabled
  const requiresPremiumButNotEnabled = tool.requiresPremium === true && premiumEnabled !== true;
  
  return isUnavailable || requiresPremiumButNotEnabled;
};

export function useToolMeta(id: string, tool: ToolRegistryEntry) {
  const { hotkeys } = useHotkeys();
  const { isFavorite, toggleFavorite } = useToolWorkflow();
  const { config } = useAppConfig();
  const premiumEnabled = config?.premiumEnabled;

  const isFav = isFavorite(id as ToolId);
  const binding = hotkeys[id as ToolId];
  const disabled = isToolDisabled(id, tool, premiumEnabled);

  return {
    binding,
    isFav,
    toggleFavorite: () => toggleFavorite(id as ToolId),
    disabled,
    premiumEnabled,
  };
}


