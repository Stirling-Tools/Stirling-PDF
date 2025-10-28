import { useMemo } from 'react';

import type { ToolId } from '@app/types/toolId';
import type { ToolRegistry } from '@app/data/toolsTaxonomy';
import ToolRegistryContext, { ToolRegistryCatalog } from '@app/contexts/ToolRegistryContext';
import { useTranslatedToolCatalog } from '@app/data/useTranslatedToolRegistry';

interface ToolRegistryProviderProps {
  children: React.ReactNode;
}

export const ToolRegistryProvider: React.FC<ToolRegistryProviderProps> = ({ children }) => {
  const catalog = useTranslatedToolCatalog();

  const contextValue = useMemo<ToolRegistryCatalog>(() => {
    const { regularTools, superTools, linkTools } = catalog;
    const allTools: ToolRegistry = {
      ...regularTools,
      ...superTools,
      ...linkTools,
    };

    const getToolById = (toolId: ToolId | null) => {
      if (!toolId) {
        return null;
      }
      return allTools[toolId] ?? null;
    };

    return {
      regularTools,
      superTools,
      linkTools,
      allTools,
      getToolById,
    };
  }, [catalog]);

  return (
    <ToolRegistryContext.Provider value={contextValue}>
      {children}
    </ToolRegistryContext.Provider>
  );
};
