/**
 * Proprietary tool ID definitions.
 * This file overrides src/core/types/proprietaryToolId.ts
 * to add proprietary-specific tool IDs.
 */

export const PROPRIETARY_REGULAR_TOOL_IDS = [] as const;

// "ai-workflow" is a generic marker stamped onto files produced by the agents
// chat orchestrator (which may invoke one or more underlying tools). Lives here
// as a super-tool so ``ToolOperation.toolId`` stays typed; not user-pickable —
// see ChatContext.tsx. The tool registry doesn't include it as an entry.
export const PROPRIETARY_SUPER_TOOL_IDS = ["ai-workflow"] as const;

export const PROPRIETARY_LINK_TOOL_IDS = [] as const;

export type ProprietaryRegularToolId =
  (typeof PROPRIETARY_REGULAR_TOOL_IDS)[number];
export type ProprietarySuperToolId =
  (typeof PROPRIETARY_SUPER_TOOL_IDS)[number];
export type ProprietaryLinkToolId = (typeof PROPRIETARY_LINK_TOOL_IDS)[number];
export type ProprietaryToolId =
  | ProprietaryRegularToolId
  | ProprietarySuperToolId
  | ProprietaryLinkToolId;
