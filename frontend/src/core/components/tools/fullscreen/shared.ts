import { useHotkeys } from '@app/contexts/HotkeyContext';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { ToolRegistryEntry } from '@app/data/toolsTaxonomy';
import { ToolId } from '@app/types/toolId';

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

export const isToolDisabled = (id: string, tool: ToolRegistryEntry): boolean => {
  return !tool.component && !tool.link && id !== 'read' && id !== 'multiTool';
};

export function useToolMeta(id: string, tool: ToolRegistryEntry) {
  const { hotkeys } = useHotkeys();
  const { isFavorite, toggleFavorite } = useToolWorkflow();

  const isFav = isFavorite(id as ToolId);
  const binding = hotkeys[id as ToolId];
  const disabled = isToolDisabled(id, tool);

  return {
    binding,
    isFav,
    toggleFavorite: () => toggleFavorite(id as ToolId),
    disabled,
  };
}


