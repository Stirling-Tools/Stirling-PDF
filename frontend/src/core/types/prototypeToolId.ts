/**
 * Prototype tool ID definitions.
 * This file is overridden in src/prototypes/types/prototypeToolId.ts
 * to add experimental tool IDs that only ship in the prototypes build.
 *
 * No tool IDs should be defined in this file.
 */

export const PROTOTYPE_REGULAR_TOOL_IDS = [] as const;
export const PROTOTYPE_SUPER_TOOL_IDS = [] as const;
export const PROTOTYPE_LINK_TOOL_IDS = [] as const;

export type PrototypeRegularToolId =
  (typeof PROTOTYPE_REGULAR_TOOL_IDS)[number];
export type PrototypeSuperToolId = (typeof PROTOTYPE_SUPER_TOOL_IDS)[number];
export type PrototypeLinkToolId = (typeof PROTOTYPE_LINK_TOOL_IDS)[number];
export type PrototypeToolId =
  | PrototypeRegularToolId
  | PrototypeSuperToolId
  | PrototypeLinkToolId;
