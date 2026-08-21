import { useMemo } from "react";
import { type PrototypeToolRegistry } from "@app/data/toolsTaxonomy";

/**
 * Prototype tool registry extension.
 * This file is overridden in src/prototypes/data/usePrototypeToolRegistry.tsx
 * to add experimental tools that only ship in the prototypes build.
 *
 * No tools should be defined in this file.
 */

// Empty hook that returns an empty registry (overridden in the prototypes overlay).
export function usePrototypeToolRegistry(): PrototypeToolRegistry {
  return useMemo(() => ({}) as PrototypeToolRegistry, []);
}
