/**
 * Core stubs for the right-rail Agents UI.
 *
 * The real implementations live in {@code proprietary/components/agents/AgentsPanel.tsx}
 * and shadow these stubs via the {@code @app/*} alias cascade when the proprietary
 * build is active. Core builds render nothing, so the right rail collapses to the
 * tool list unchanged.
 */

/** Whether the right rail should reserve space for agents UI. False in core. */
export function useAgentsEnabled(): boolean {
  return false;
}

/**
 * Whether the agent chat panel is currently open. Core builds have no chat,
 * so this always returns false. Proprietary builds bridge to the ChatContext.
 */
export function useAgentChatOpen(): boolean {
  return false;
}

/** Inline "Agents" section rendered above the tool list in {@code ToolPicker}. */
export function AgentsSection() {
  return null;
}

/**
 * Icon-only agent button rendered in the collapsed (minimised) right rail.
 * Returns null in core; proprietary renders the Stirling agent shortcut.
 */
export function AgentsCollapsedButton(_props: { onExpand: () => void }) {
  return null;
}

/**
 * Agents card rendered inside the fullscreen tool picker. Matches the visual
 * language of the fullscreen category cards (gradient border, title, items).
 * Returns null in core; proprietary renders the Stirling agent.
 */
export function AgentsFullscreenSection() {
  return null;
}
