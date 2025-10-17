import { createContext, useContext } from 'react';

import type { ToolRegistryEntry, ToolRegistryMap } from '../data/toolsTaxonomy';
import type { ToolId } from '../types/toolId';

export interface ToolRegistryCatalog {
  regularTools: ToolRegistryMap;
  superTools: ToolRegistryMap;
  linkTools: ToolRegistryMap;
  allTools: ToolRegistryMap;
  getToolById: (toolId: ToolId | null) => ToolRegistryEntry | null;
}

const ToolRegistryContext = createContext<ToolRegistryCatalog | null>(null);

export const useToolRegistry = (): ToolRegistryCatalog => {
  const context = useContext(ToolRegistryContext);
  if (context === null) {
    throw new Error('useToolRegistry must be used within a ToolRegistryProvider');
  }
  return context;
};

export default ToolRegistryContext;
