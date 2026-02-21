import { useMemo } from "react";
import { type ProprietaryToolRegistry } from "@app/data/toolsTaxonomy";

/**
 * Hook that provides the proprietary tool registry.
 *
 * This is the definition of all proprietary tools,
 * and will be included in the main tool registry.
 */
export function useProprietaryToolRegistry(): ProprietaryToolRegistry {
  return useMemo<ProprietaryToolRegistry>(() => ({}), []);
}
