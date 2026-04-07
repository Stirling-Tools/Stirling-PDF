/**
 * Types for the AI Agent Chat system.
 */

/** Action approval state for messages that require user confirmation. */
export type ActionDecision = 'pending' | 'accepted' | 'denied';

/** A suggestion chip the AI generates for the user to click. */
export interface SuggestionChip {
  label: string;
  /** When true, clicking focuses the text input instead of sending the label as a message. */
  isOther?: boolean;
}

/** A single message in the chat conversation. */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  agentTree?: AgentTreeNode;
  isStreaming?: boolean;
  /** Set when this message represents an error (action failure, connection issue, etc.). */
  isError?: boolean;
  /** Set when the agent emits an action_required event (e.g. auto_redact, form_fill). */
  actionType?: string;
  actionPayload?: unknown;
  actionDecision?: ActionDecision;
  /** AI-generated follow-up suggestions shown as clickable chips. */
  suggestions?: SuggestionChip[];
  /** Index of the suggestion the user clicked (undefined = none selected yet). */
  selectedSuggestion?: number;
}

/** A node in the collapsible agent call tree. */
export interface AgentTreeNode {
  agentId: string;
  agentName: string;
  parentAgentId: string | null;
  status: 'running' | 'success' | 'error';
  resultSummary?: string;
  durationMs?: number;
  content: string;
  children: AgentTreeNode[];
  expanded: boolean;
  actionType?: string;
  actionPayload?: unknown;
}

/** A parsed SSE event from the agent stream. */
export interface ChatEvent {
  eventType: string;
  runId: string;
  agentId: string;
  agentName?: string;
  parentAgentId?: string | null;
  delta?: string;
  status?: string;
  result?: unknown;
  resultSummary?: string;
  durationMs?: number;
  actionType?: string;
  actionPayload?: unknown;
  error?: string;
  suggestions?: SuggestionChip[];
}

/** Metadata for a registered AI agent. */
export interface AgentMeta {
  agentId: string;
  name: string;
  description: string;
  category: string;
}
