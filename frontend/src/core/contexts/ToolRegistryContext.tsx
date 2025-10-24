import { createContext, useContext } from 'react';

import type {
  ToolRegistryEntry,
  ToolRegistry,
  RegularToolRegistry,
  SuperToolRegistry,
  LinkToolRegistry,
} from '@app/data/toolsTaxonomy';
import type { ToolId } from '@app/types/toolId';

export interface ToolRegistryCatalog {
  regularTools: RegularToolRegistry;
  superTools: SuperToolRegistry;
  linkTools: LinkToolRegistry;
  allTools: ToolRegistry;
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
