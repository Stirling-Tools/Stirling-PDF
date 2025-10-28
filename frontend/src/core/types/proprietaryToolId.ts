/**
 * Proprietary tool ID definitions.
 * This file is overridden in src/proprietary/types/proprietaryToolId.ts
 * to add proprietary-specific tool IDs.
 *
 * No tool IDs should be defined in this file.
 */

export const PROPRIETARY_REGULAR_TOOL_IDS = [] as const;
export const PROPRIETARY_SUPER_TOOL_IDS = [] as const;
export const PROPRIETARY_LINK_TOOL_IDS = [] as const;

export type ProprietaryRegularToolId = typeof PROPRIETARY_REGULAR_TOOL_IDS[number];
export type ProprietarySuperToolId = typeof PROPRIETARY_SUPER_TOOL_IDS[number];
export type ProprietaryLinkToolId = typeof PROPRIETARY_LINK_TOOL_IDS[number];
export type ProprietaryToolId = ProprietaryRegularToolId | ProprietarySuperToolId | ProprietaryLinkToolId;
