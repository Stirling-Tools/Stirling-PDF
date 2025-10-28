import { useMemo } from 'react';
import { ToolId } from '@app/types/toolId';
import { ToolRegistryEntry } from '@app/data/toolsTaxonomy';

export function useFavoriteToolItems(
  favoriteTools: ToolId[],
  toolRegistry: Partial<Record<ToolId, ToolRegistryEntry>>
): Array<{ id: ToolId; tool: ToolRegistryEntry }> {
  return useMemo(() => {
    return favoriteTools
      .map((toolId) => {
        const tool = toolRegistry[toolId as ToolId];
        return tool ? { id: toolId as ToolId, tool } : null;
      })
      .filter((x): x is { id: ToolId; tool: ToolRegistryEntry } => x !== null)
      .filter(({ id, tool }) => Boolean(tool.component) || Boolean(tool.link) || id === 'read' || id === 'multiTool');
  }, [favoriteTools, toolRegistry]);
}


