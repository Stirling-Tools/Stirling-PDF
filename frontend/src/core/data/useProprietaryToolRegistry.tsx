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
  return useMemo(() => ({} as ProprietaryToolRegistry), []);
}
