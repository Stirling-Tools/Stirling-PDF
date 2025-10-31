import { useMemo } from 'react';

import { useToolRegistry } from '@app/contexts/ToolRegistryContext';
import { AutomateToolRegistry, AutomateToolId, AUTOMATABLE_TOOL_IDS } from '@app/types/automation';

export const useAutomateToolRegistry = (): AutomateToolRegistry => {
  const { regularTools } = useToolRegistry();

  return useMemo(() => {
    const registry = {} as AutomateToolRegistry;

    AUTOMATABLE_TOOL_IDS.forEach((toolId: AutomateToolId) => {
      const tool = regularTools[toolId];
      if (!tool) {
        throw new Error(`Automatable tool '${toolId}' is missing from the regular tool registry.`);
      }
      registry[toolId] = tool;
    });

    return registry;
  }, [regularTools]);
};
