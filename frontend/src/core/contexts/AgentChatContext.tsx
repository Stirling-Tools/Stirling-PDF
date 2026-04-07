/**
 * AgentChatContext — state management for the AI agent chat panel.
 *
 * Manages conversation messages, SSE streaming, agent tree construction,
 * IndexedDB session persistence, and integration with the file context.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ActionDecision, AgentMeta, AgentTreeNode, ChatEvent, ChatMessage, SuggestionChip } from '@app/types/agentChat';
import { fetchAgentList, startAgentStream } from '@app/services/agentStreamService';
import { executeAgentAction } from '@app/services/agentActionService';
import { chatStorage } from '@app/services/chatStorage';
import type { PersistedChatMessage } from '@app/services/chatStorage';
import type { AgentId } from '@app/data/agentRegistry';

interface AgentChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  isPanelOpen: boolean;
  availableAgents: AgentMeta[];
  sessionId: string | null;
  isLoadingHistory: boolean;
}

interface AgentChatActions {
  sendMessage: (text: string, fileNames?: string[], extractedText?: string) => void;
  cancelStream: () => void;
  clearChat: () => void;
  togglePanel: () => void;
  setPanel: (open: boolean) => void;
  toggleNodeExpanded: (messageId: string, agentId: string) => void;
  /** Handle an action approval decision. Pass activeFiles so the action can be executed. */
  handleAction: (messageId: string, decision: ActionDecision, activeFiles: File[], instructions?: string) => void;
  /** Mark an action type to be auto-accepted in future messages. */
  setAutoAccept: (actionType: string) => void;
  /** Notify the context which agent is currently open (triggers history auto-load on first open). */
  setCurrentAgent: (agentId: AgentId) => void;
  /** Load a specific historical session into the current view. */
  openSession: (sessionId: string) => void;
  /** Delete a session from IndexedDB; clears in-memory state if it was active. */
  deleteSession: (sessionId: string) => Promise<void>;
  /** Mark a suggestion chip as selected on a message. */
  selectSuggestion: (messageId: string, index: number) => void;
}

const AgentChatStateContext = createContext<AgentChatState | null>(null);
const AgentChatActionsContext = createContext<AgentChatActions | null>(null);

/** Map frontend agent IDs to backend agent IDs for direct routing. */
const BACKEND_AGENT_MAP: Record<string, string> = {
  'document-summary': 'doc_summary',
  'advanced-redaction': 'auto_redact',
  'pdf-editor': 'pdf_edit',
  // 'stirling-general' is intentionally absent — it always routes via the orchestrator.
};

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Map a persisted IndexedDB message back to the in-memory ChatMessage shape. */
function fromPersisted(m: PersistedChatMessage): ChatMessage {
  return {
    id: m.id,
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
    timestamp: new Date(m.timestamp).toISOString(),
    agentTree: m.agentTree,
    actionType: m.actionType,
    actionPayload: m.actionPayload,
    actionDecision: m.actionDecision,
    isError: m.isError,
    suggestions: m.suggestions,
    selectedSuggestion: m.selectedSuggestion,
  };
}

/** Patterns that indicate a "custom/other" option in fallback-parsed suggestions. */
const OTHER_HINT = /^(a\s+)?custom\b|^other\b|^specify\b|^type\b|^enter\b/i;

/**
 * Fallback: extract suggestion options from parenthesized lists anywhere in text.
 * Matches patterns like "(90, 180, 270 degrees, or other)" or "(e.g., 90°, 180°, 270°)".
 * Picks the longest match with 2+ items to avoid false positives.
 */
function extractInlineSuggestions(text: string): SuggestionChip[] | undefined {
  // Find ALL parenthesized groups with comma/or-separated items
  const groups = [...text.matchAll(/\(([^)]{8,200})\)/g)];
  if (groups.length === 0) return undefined;

  let best: SuggestionChip[] | undefined;

  for (const group of groups) {
    const inner = group[1];
    // Must contain a comma or " or " to be a list
    if (!inner.includes(',') && !/ or /i.test(inner)) continue;

    const parts = inner
      .split(/,\s*|\s+or\s+/)
      .map((s) => s.replace(/^e\.g\.?\s*/i, '').replace(/^\d+\)\s*/, '').trim())
      .filter((s) => s.length > 1 && s.length < 60);

    if (parts.length >= 2 && (!best || parts.length > best.length)) {
      best = parts.map((label) => ({
        label,
        isOther: OTHER_HINT.test(label),
      }));
    }
  }

  // Always ensure an "other" option exists
  if (best && !best.some((c) => c.isOther)) {
    best.push({ label: 'Something else', isOther: true });
  }

  return best;
}

function buildTreeFromMap(nodeMap: Map<string, AgentTreeNode>): AgentTreeNode | undefined {
  // Find root node (parentAgentId === null)
  let root: AgentTreeNode | undefined;
  for (const node of nodeMap.values()) {
    if (node.parentAgentId === null) {
      root = node;
    } else {
      const parent = nodeMap.get(node.parentAgentId);
      if (parent && !parent.children.find((c) => c.agentId === node.agentId)) {
        parent.children.push(node);
      }
    }
  }
  return root;
}

export function AgentChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<AgentMeta[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const autoAcceptTypes = useRef<Set<string>>(new Set());
  const nodeMapRef = useRef<Map<string, AgentTreeNode>>(new Map());
  const streamingMessageIdRef = useRef<string | null>(null);
  const rafPendingRef = useRef(false);

  // Refs for use inside callbacks (avoid stale closure issues)
  const currentAgentRef = useRef<AgentId | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);

  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Fetch agents on mount
  useEffect(() => {
    fetchAgentList()
      .then(setAvailableAgents)
      .catch((err) => console.warn('[AgentChat] Failed to fetch agents:', err));
  }, []);

  /** Throttled tree→state flush: coalesces rapid token events into one rAF update. */
  const updateStreamingMessage = useCallback(() => {
    if (rafPendingRef.current) return;
    rafPendingRef.current = true;
    requestAnimationFrame(() => {
      rafPendingRef.current = false;
      const msgId = streamingMessageIdRef.current;
      if (!msgId) return;
      const tree = buildTreeFromMap(nodeMapRef.current);
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, agentTree: tree ? { ...tree } : undefined } : m))
      );
    });
  }, []);

  const handleEvent = useCallback(
    (event: ChatEvent) => {
      const map = nodeMapRef.current;

      switch (event.eventType) {
        case 'agent_start': {
          const node: AgentTreeNode = {
            agentId: event.agentId,
            agentName: event.agentName ?? event.agentId,
            parentAgentId: event.parentAgentId ?? null,
            status: 'running',
            content: '',
            children: [],
            expanded: true,
          };
          map.set(event.agentId, node);
          updateStreamingMessage();
          break;
        }

        case 'token': {
          const node = map.get(event.agentId);
          if (node && event.delta) {
            node.content += event.delta;
            updateStreamingMessage();
          }
          break;
        }

        case 'agent_complete': {
          const node = map.get(event.agentId);
          if (node) {
            node.status = (event.status as 'success' | 'error') ?? 'success';
            node.resultSummary = event.resultSummary;
            node.durationMs = event.durationMs;
            // Collapse completed non-root nodes
            if (node.parentAgentId !== null) {
              node.expanded = false;
            }
            updateStreamingMessage();
          }
          break;
        }

        case 'action_required': {
          const node = map.get(event.agentId);
          if (node) {
            node.actionType = event.actionType;
            node.actionPayload = event.actionPayload;
            updateStreamingMessage();
          }
          break;
        }

        case 'suggestions': {
          // Store suggestions on the streaming message so the UI can render them as chips
          const msgId = streamingMessageIdRef.current;
          if (msgId && event.suggestions) {
            setMessages((prev) =>
              prev.map((m) => (m.id === msgId ? { ...m, suggestions: event.suggestions } : m))
            );
          }
          break;
        }

        case 'error': {
          const node = map.get(event.agentId);
          if (node) {
            node.status = 'error';
            node.resultSummary = event.error;
            updateStreamingMessage();
          }
          break;
        }

        case 'done': {
          // Finalize the streaming message
          const msgId = streamingMessageIdRef.current;
          if (msgId) {
            const tree = buildTreeFromMap(nodeMapRef.current);
            // Extract final content from the deepest agent that has content
            let finalContent = '';
            let actionType: string | undefined;
            let actionPayload: unknown | undefined;
            if (tree) {
              const findContent = (n: AgentTreeNode): string => {
                for (const child of n.children) {
                  const childContent = findContent(child);
                  if (childContent) return childContent;
                }
                return n.content;
              };
              finalContent = findContent(tree);

              // Find action_required data from any node in the tree
              const findAction = (n: AgentTreeNode): void => {
                if (n.actionType) {
                  actionType = n.actionType;
                  actionPayload = n.actionPayload;
                }
                for (const child of n.children) findAction(child);
              };
              findAction(tree);
            }

            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId
                  ? {
                      ...m,
                      content: finalContent,
                      isStreaming: false,
                      agentTree: tree ? { ...tree } : undefined,
                      actionType,
                      actionPayload,
                      actionDecision: actionType
                        ? (autoAcceptTypes.current.has(actionType) ? 'accepted' : 'pending')
                        : undefined,
                      // Preserve suggestions set during streaming; if none, try to
                      // extract parenthesized options from the content as a fallback.
                      suggestions: m.suggestions?.length
                        ? m.suggestions
                        : extractInlineSuggestions(finalContent),
                    }
                  : m
              )
            );

            // Persist assistant message to IndexedDB (including agent tree + action data)
            const sid = sessionIdRef.current;
            const agId = currentAgentRef.current;
            if (sid && agId && finalContent) {
              const now = Date.now();
              const decision = actionType
                ? (autoAcceptTypes.current.has(actionType) ? 'accepted' as const : 'pending' as const)
                : undefined;
              // Get suggestions from the streaming message (set by the suggestions event)
              const currentMsg = messagesRef.current.find((m) => m.id === msgId);
              const suggestions = currentMsg?.suggestions;
              chatStorage.addMessage({
                id: `msg-${now}-${Math.random().toString(36).slice(2, 7)}`,
                sessionId: sid,
                agentId: agId,
                role: 'agent',
                content: finalContent,
                timestamp: now,
                agentTree: tree ? { ...tree } : undefined,
                actionType,
                actionPayload,
                actionDecision: decision,
                suggestions,
              }).catch(console.error);
              chatStorage.updateSession(sid, {
                updatedAt: now,
                lastMessage: finalContent.slice(0, 80),
              }).catch(console.error);
            }

            // Auto-execute if this action type was previously "always accepted"
            if (actionType && autoAcceptTypes.current.has(actionType) && actionPayload) {
              window.dispatchEvent(
                new CustomEvent('agent-action-auto-execute', {
                  detail: { actionType, actionPayload },
                })
              );
            }
          }
          setIsStreaming(false);
          streamingMessageIdRef.current = null;
          break;
        }
      }
    },
    [updateStreamingMessage]
  );

  const sendMessage = useCallback(
    (text: string, fileNames?: string[], extractedText?: string) => {
      if (isStreaming) return;

      const now = Date.now();
      const userMsgId = generateId();

      // Add user message
      const userMsg: ChatMessage = {
        id: userMsgId,
        role: 'user',
        content: text,
        timestamp: new Date(now).toISOString(),
      };

      // Add placeholder assistant message
      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        isStreaming: true,
      };

      // Build history from prior messages (use ref to avoid stale closure)
      const history = messagesRef.current
        .filter((m) => !m.isStreaming && m.content)
        .map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);
      streamingMessageIdRef.current = assistantMsg.id;
      nodeMapRef.current = new Map();

      // Persist user message: get or create session
      const agId = currentAgentRef.current;
      if (agId) {
        const existingSid = sessionIdRef.current;
        const sessionPromise: Promise<string> = existingSid
          ? Promise.resolve(existingSid)
          : chatStorage.createSession(agId, text.slice(0, 60)).then((session) => {
              setSessionId(session.id);
              sessionIdRef.current = session.id;
              return session.id;
            });

        sessionPromise.then((sid) => {
          chatStorage.addMessage({
            id: userMsgId,
            sessionId: sid,
            agentId: agId,
            role: 'user',
            content: text,
            timestamp: now,
          }).catch(console.error);
          chatStorage.updateSession(sid, {
            updatedAt: now,
            lastMessage: text.slice(0, 80),
          }).catch(console.error);
        }).catch(console.error);
      }

      // On follow-up messages in a non-general agent chat, skip orchestrator routing
      // by sending the backend agent_id directly.
      const currentAgent = currentAgentRef.current;
      const backendAgentId = (history.length > 0 && currentAgent)
        ? BACKEND_AGENT_MAP[currentAgent]
        : undefined;

      abortRef.current = startAgentStream({
        message: text,
        fileNames,
        extractedText,
        history,
        agentId: backendAgentId,
        onEvent: handleEvent,
        onError: (error) => {
          console.error('[AgentChat] Stream error:', error);
          const isNetworkError =
            error instanceof TypeError && error.message === 'Failed to fetch';
          const userMessage = isNetworkError
            ? 'Could not connect to the AI engine. Make sure the backend and Python engine are running.'
            : `Error: ${error.message}`;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: userMessage, isStreaming: false, isError: true }
                : m
            )
          );
          setIsStreaming(false);
          streamingMessageIdRef.current = null;
        },
        onComplete: () => {
          // done event handles finalization; this is a fallback
          if (streamingMessageIdRef.current === assistantMsg.id) {
            setIsStreaming(false);
            streamingMessageIdRef.current = null;
          }
        },
      });
    },
    [isStreaming, handleEvent]
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    const msgId = streamingMessageIdRef.current;
    if (msgId) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, content: m.content || 'Cancelled.', isStreaming: false } : m
        )
      );
      streamingMessageIdRef.current = null;
    }
  }, []);

  const clearChat = useCallback(() => {
    cancelStream();
    setMessages([]);
    setSessionId(null);
    sessionIdRef.current = null;
  }, [cancelStream]);

  const setCurrentAgent = useCallback((agentId: AgentId) => {
    if (currentAgentRef.current === agentId) return;
    currentAgentRef.current = agentId;

    // Always start fresh when switching agents — user can explicitly open history via the clock icon.
    setMessages([]);
    setSessionId(null);
    sessionIdRef.current = null;
  }, []);

  const openSession = useCallback((sid: string) => {
    setIsLoadingHistory(true);
    chatStorage.getMessagesForSession(sid)
      .then((msgs) => {
        setMessages(msgs.map(fromPersisted));
        setSessionId(sid);
        sessionIdRef.current = sid;
        setIsLoadingHistory(false);
      })
      .catch((err) => {
        console.error('[AgentChat] Failed to load session:', err);
        setIsLoadingHistory(false);
      });
  }, []);

  const deleteSession = useCallback(async (sid: string): Promise<void> => {
    await chatStorage.deleteSession(sid);
    if (sessionIdRef.current === sid) {
      setMessages([]);
      setSessionId(null);
      sessionIdRef.current = null;
    }
  }, []);

  const togglePanel = useCallback(() => setIsPanelOpen((p) => !p), []);
  const setPanel = useCallback((open: boolean) => setIsPanelOpen(open), []);

  const toggleNodeExpanded = useCallback((messageId: string, agentId: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.agentTree) return m;
        const toggleInTree = (node: AgentTreeNode): AgentTreeNode => ({
          ...node,
          expanded: node.agentId === agentId ? !node.expanded : node.expanded,
          children: node.children.map(toggleInTree),
        });
        return { ...m, agentTree: toggleInTree(m.agentTree) };
      })
    );
  }, []);

  const handleAction = useCallback(
    async (messageId: string, decision: ActionDecision, activeFiles: File[], instructions?: string) => {
      // Use ref to avoid stale closure — prevents re-render cascade via actions memo.
      const msg = messagesRef.current.find((m) => m.id === messageId);

      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, actionDecision: decision } : m))
      );

      // Persist decision change to IndexedDB
      chatStorage.updateMessage(messageId, { actionDecision: decision }).catch(console.error);

      if (decision === 'accepted' && msg?.actionType && msg?.actionPayload) {
        try {
          const { successes, errors } = await executeAgentAction(msg.actionType, msg.actionPayload, activeFiles);

          if (successes.length > 0) {
            window.dispatchEvent(
              new CustomEvent('agent-action-files', { detail: { results: successes, actionType: msg.actionType } })
            );
            // Show success confirmation
            const successMsg: ChatMessage = {
              id: generateId(),
              role: 'assistant',
              content: successes.length === 1
                ? `Done — processed **${successes[0].outputFileName}** successfully.`
                : `Done — processed **${successes.length} file(s)** successfully.`,
              timestamp: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, successMsg]);
          }

          if (successes.length === 0 && errors.length === 0) {
            const noFilesMsg: ChatMessage = {
              id: generateId(),
              role: 'assistant',
              content: 'No files were processed. Make sure PDF documents are loaded in the workbench.',
              timestamp: new Date().toISOString(),
              isError: true,
            };
            setMessages((prev) => [...prev, noFilesMsg]);
          }

          if (errors.length > 0) {
            // Show errors as a follow-up message and revert to pending for retry
            const errorText = errors.length === 1
              ? `Failed to process: ${errors[0].error}`
              : `Failed to process ${errors.length} file(s):\n${errors.map((e) => `- ${e.error}`).join('\n')}`;
            const hasPartialSuccess = successes.length > 0;
            const prefix = hasPartialSuccess
              ? `Processed ${successes.length} file(s) successfully, but some failed.\n\n`
              : '';

            const errorMsg: ChatMessage = {
              id: generateId(),
              role: 'assistant',
              content: `${prefix}${errorText}\n\nYou can retry the action or ask me to try a different approach.`,
              timestamp: new Date().toISOString(),
              isError: true,
            };
            setMessages((prev) => [...prev, errorMsg]);

            // If no successes at all, revert to pending so user can retry
            if (successes.length === 0) {
              setMessages((prev) =>
                prev.map((m) => (m.id === messageId ? { ...m, actionDecision: 'pending' as ActionDecision } : m))
              );
            }
          }
        } catch (err) {
          console.error('[AgentChat] Action execution failed:', err);
          const errorMsg: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: `Action failed: ${err instanceof Error ? err.message : 'Unknown error'}. You can retry or ask me to try a different approach.`,
            timestamp: new Date().toISOString(),
            isError: true,
          };
          setMessages((prev) => [...prev, errorMsg]);
          // Revert to pending so the user can retry
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, actionDecision: 'pending' as ActionDecision } : m))
          );
        }
      }

      if (decision === 'denied' && instructions) {
        // Dispatch event so the AgentChat component sends through the normal flow
        // (which includes text extraction from active files)
        queueMicrotask(() => {
          window.dispatchEvent(
            new CustomEvent('agent-deny-with-instructions', { detail: { instructions } })
          );
        });
      }
    },
    []
  );

  const setAutoAccept = useCallback((actionType: string) => {
    autoAcceptTypes.current.add(actionType);
  }, []);

  const selectSuggestion = useCallback((messageId: string, index: number) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, selectedSuggestion: index } : m))
    );
  }, []);

  const state = useMemo<AgentChatState>(
    () => ({ messages, isStreaming, isPanelOpen, availableAgents, sessionId, isLoadingHistory }),
    [messages, isStreaming, isPanelOpen, availableAgents, sessionId, isLoadingHistory]
  );

  const actions = useMemo<AgentChatActions>(
    () => ({
      sendMessage, cancelStream, clearChat, togglePanel, setPanel,
      toggleNodeExpanded, handleAction, setAutoAccept,
      setCurrentAgent, openSession, deleteSession, selectSuggestion,
    }),
    [sendMessage, cancelStream, clearChat, togglePanel, setPanel,
     toggleNodeExpanded, handleAction, setAutoAccept,
     setCurrentAgent, openSession, deleteSession, selectSuggestion]
  );

  return (
    <AgentChatStateContext.Provider value={state}>
      <AgentChatActionsContext.Provider value={actions}>{children}</AgentChatActionsContext.Provider>
    </AgentChatStateContext.Provider>
  );
}

export function useAgentChatState(): AgentChatState {
  const ctx = useContext(AgentChatStateContext);
  if (!ctx) throw new Error('useAgentChatState must be within AgentChatProvider');
  return ctx;
}

export function useAgentChatActions(): AgentChatActions {
  const ctx = useContext(AgentChatActionsContext);
  if (!ctx) throw new Error('useAgentChatActions must be within AgentChatProvider');
  return ctx;
}
