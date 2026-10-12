import { useMemo } from "react";
import { type ProprietaryToolRegistry } from "@app/data/toolsTaxonomy";

/**
 * Proprietary tool registry extension.
 * This file is overridden in src/proprietary/data/useProprietaryToolRegistry.tsx
 * to add proprietary-specific tools.
 *
 * No tools should be defined in this file.
 */

// Empty hook that returns empty registry (overridden in proprietary version)
export function useProprietaryToolRegistry(): ProprietaryToolRegistry {
  // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- proprietary builds run this stub, where ProprietaryToolId is not empty
  return useMemo(() => ({}) as ProprietaryToolRegistry, []);
}
