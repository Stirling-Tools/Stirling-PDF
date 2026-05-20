/**
 * Prototype tool ID definitions — real implementation.
 *
 * Overrides the empty stub at {@code core/types/prototypeToolId.ts} when
 * built in prototypes mode. Tools listed here are only reachable from the
 * prototypes build (and any build whose {@code @app/*} alias chain reaches
 * {@code src/prototypes/*}) — they are invisible to the core / proprietary
 * / saas / desktop bundles.
 *
 * Add an id here when the accompanying tool file lives under
 * {@code frontend/src/prototypes/tools/...} and you want it surfaced in the
 * prototypes build's tool picker.
 */

export const PROTOTYPE_REGULAR_TOOL_IDS = ["pdfCommentAgent"] as const;
// "ai-workflow" is a generic marker stamped onto files produced by the AI
// orchestrator (which may invoke one or more underlying tools). Lives here as
// a super-tool so ``ToolOperation.toolId`` stays typed; not user-pickable —
// see ChatContext.tsx. The prototype tool registry doesn't include it as an
// entry, which is fine since the registry uses an ``as`` cast.
export const PROTOTYPE_SUPER_TOOL_IDS = ["ai-workflow"] as const;
export const PROTOTYPE_LINK_TOOL_IDS = [] as const;

export type PrototypeRegularToolId =
  (typeof PROTOTYPE_REGULAR_TOOL_IDS)[number];
export type PrototypeSuperToolId = (typeof PROTOTYPE_SUPER_TOOL_IDS)[number];
export type PrototypeLinkToolId = (typeof PROTOTYPE_LINK_TOOL_IDS)[number];
export type PrototypeToolId =
  | PrototypeRegularToolId
  | PrototypeSuperToolId
  | PrototypeLinkToolId;
