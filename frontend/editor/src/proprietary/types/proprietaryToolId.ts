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
// "policy" is the same pattern for Policies: a policy run is a multi-tool
// automation (redact/watermark/sanitize/…), not any single tool, so file
// version provenance is stamped with this marker rather than one of its
// underlying steps — see usePolicyAutoRun.ts.
export const PROPRIETARY_SUPER_TOOL_IDS = ["ai-workflow", "policy"] as const;

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
