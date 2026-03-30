/**
 * AgentContext — manages runtime agent state: selection, chat history, and status.
 *
 * The static agent definitions live in agentRegistry.ts.
 * This context tracks the *dynamic* bits: which agent is open, what messages
 * have been exchanged, and each agent's live status.
 */

import React, { createContext, useCallback, useContext, useMemo, useReducer } from 'react';
import { AgentId, AgentDefinition, AGENT_MAP } from '@app/data/agentRegistry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentRuntimeStatus = 'idle' | 'running' | 'error';

export type ChatRole = 'user' | 'agent' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  /** When the agent is "thinking" / streaming */
  isStreaming?: boolean;
}

export interface AgentRuntimeState {
  status: AgentRuntimeStatus;
  chatHistory: ChatMessage[];
}

interface AgentContextState {
  /** Currently selected (open) agent id, or null if agent list is shown */
  activeAgentId: AgentId | null;
  /** Per-agent runtime states */
  runtimes: Partial<Record<AgentId, AgentRuntimeState>>;
  /** Whether the right panel is in chat mode or browse mode */
  view: 'browse' | 'chat';
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type AgentAction =
  | { type: 'OPEN_AGENT'; agentId: AgentId }
  | { type: 'CLOSE_AGENT' }
  | { type: 'SEND_MESSAGE'; agentId: AgentId; content: string }
  | { type: 'RECEIVE_MESSAGE'; agentId: AgentId; content: string }
  | { type: 'SET_AGENT_STATUS'; agentId: AgentId; status: AgentRuntimeStatus }
  | { type: 'CLEAR_CHAT'; agentId: AgentId };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

const initialState: AgentContextState = {
  activeAgentId: null,
  runtimes: {},
  view: 'browse',
};

function getOrCreateRuntime(state: AgentContextState, agentId: AgentId): AgentRuntimeState {
  return state.runtimes[agentId] ?? { status: 'idle', chatHistory: [] };
}

let msgCounter = 0;
function nextMsgId(): string {
  return `msg-${Date.now()}-${++msgCounter}`;
}

function agentReducer(state: AgentContextState, action: AgentAction): AgentContextState {
  switch (action.type) {
    case 'OPEN_AGENT':
      return { ...state, activeAgentId: action.agentId, view: 'chat' };

    case 'CLOSE_AGENT':
      return { ...state, activeAgentId: null, view: 'browse' };

    case 'SEND_MESSAGE': {
      const rt = getOrCreateRuntime(state, action.agentId);
      const msg: ChatMessage = {
        id: nextMsgId(),
        role: 'user',
        content: action.content,
        timestamp: Date.now(),
      };
      return {
        ...state,
        runtimes: {
          ...state.runtimes,
          [action.agentId]: {
            ...rt,
            status: 'running',
            chatHistory: [...rt.chatHistory, msg],
          },
        },
      };
    }

    case 'RECEIVE_MESSAGE': {
      const rt = getOrCreateRuntime(state, action.agentId);
      const msg: ChatMessage = {
        id: nextMsgId(),
        role: 'agent',
        content: action.content,
        timestamp: Date.now(),
      };
      return {
        ...state,
        runtimes: {
          ...state.runtimes,
          [action.agentId]: {
            ...rt,
            status: 'idle',
            chatHistory: [...rt.chatHistory, msg],
          },
        },
      };
    }

    case 'SET_AGENT_STATUS': {
      const rt = getOrCreateRuntime(state, action.agentId);
      return {
        ...state,
        runtimes: {
          ...state.runtimes,
          [action.agentId]: { ...rt, status: action.status },
        },
      };
    }

    case 'CLEAR_CHAT': {
      const rt = getOrCreateRuntime(state, action.agentId);
      return {
        ...state,
        runtimes: {
          ...state.runtimes,
          [action.agentId]: { ...rt, chatHistory: [] },
        },
      };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface AgentContextValue {
  state: AgentContextState;
  /** Open an agent's chat view */
  openAgent: (agentId: AgentId) => void;
  /** Return to browse view */
  closeAgent: () => void;
  /** Send a user message to the active agent */
  sendMessage: (agentId: AgentId, content: string) => void;
  /** Simulate an agent response (placeholder until real backend) */
  receiveMessage: (agentId: AgentId, content: string) => void;
  /** Get the runtime for an agent */
  getRuntime: (agentId: AgentId) => AgentRuntimeState;
  /** Get the definition for the active agent */
  activeAgent: AgentDefinition | null;
  /** Clear chat history for an agent */
  clearChat: (agentId: AgentId) => void;
}

const AgentContext = createContext<AgentContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(agentReducer, initialState);

  const openAgent = useCallback((agentId: AgentId) => {
    dispatch({ type: 'OPEN_AGENT', agentId });
  }, []);

  const closeAgent = useCallback(() => {
    dispatch({ type: 'CLOSE_AGENT' });
  }, []);

  const sendMessage = useCallback((agentId: AgentId, content: string) => {
    dispatch({ type: 'SEND_MESSAGE', agentId, content });

    // ── Placeholder: simulate agent response after a short delay ──
    // Replace this block with real API call to pydantic AI backend
    setTimeout(() => {
      const agent = AGENT_MAP[agentId];
      const agentName = agent?.name ?? 'Agent';
      dispatch({
        type: 'RECEIVE_MESSAGE',
        agentId,
        content: `[${agentName}] This is a placeholder response. The real AI backend will process: "${content.slice(0, 80)}${content.length > 80 ? '...' : ''}"`,
      });
    }, 800 + Math.random() * 700);
  }, []);

  const receiveMessage = useCallback((agentId: AgentId, content: string) => {
    dispatch({ type: 'RECEIVE_MESSAGE', agentId, content });
  }, []);

  const getRuntime = useCallback(
    (agentId: AgentId): AgentRuntimeState => {
      return state.runtimes[agentId] ?? { status: 'idle', chatHistory: [] };
    },
    [state.runtimes]
  );

  const clearChat = useCallback((agentId: AgentId) => {
    dispatch({ type: 'CLEAR_CHAT', agentId });
  }, []);

  const activeAgent = useMemo(
    () => (state.activeAgentId ? AGENT_MAP[state.activeAgentId] ?? null : null),
    [state.activeAgentId]
  );

  const value = useMemo<AgentContextValue>(
    () => ({ state, openAgent, closeAgent, sendMessage, receiveMessage, getRuntime, activeAgent, clearChat }),
    [state, openAgent, closeAgent, sendMessage, receiveMessage, getRuntime, activeAgent, clearChat]
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAgentContext(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error('useAgentContext must be used within <AgentProvider>');
  return ctx;
}
