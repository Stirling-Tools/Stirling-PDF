/**
 * AgentChat — inline chat view in the right panel.
 *
 * Design:
 *  - User messages render as right-aligned chat bubbles
 *  - AI responses render as plain full-width text (no bubble)
 *  - Agent/tool calls render as flat collapsible rows (accordion style)
 *  - No indentation nesting — all agent rows are flush-left with borders
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import StopCircleRoundedIcon from '@mui/icons-material/StopCircleRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import { Collapse, Loader } from '@mantine/core';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import { useAgentChatState, useAgentChatActions } from '@app/contexts/AgentChatContext';
import { ChatHistoryView } from '@app/components/rightPanel/ChatHistoryView';
import { useFileContext } from '@app/contexts/file/fileHooks';
import { AgentDefinition } from '@app/data/agentRegistry';
import { resolveAgentIcon } from '@app/components/rightPanel/AgentIconMap';
import { extractTextFromFiles } from '@app/services/pdfTextExtractionService';
import { createChildStub } from '@app/contexts/file/fileActions';
import { createStirlingFile } from '@app/types/fileContext';
import { thumbnailGenerationService } from '@app/services/thumbnailGenerationService';
import type { ActionDecision, ChatMessage, AgentTreeNode } from '@app/types/agentChat';
import type { ActionFileResult } from '@app/services/agentActionService';
import { SimpleMarkdown } from '@app/components/rightPanel/SimpleMarkdown';

import '@app/components/rightPanel/AgentChat.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Find the content from the deepest node that has text (for live streaming display). */
function findDeepestContent(node: AgentTreeNode): string {
  for (const child of node.children) {
    const childContent = findDeepestContent(child);
    if (childContent) return childContent;
  }
  return node.content;
}

// ---------------------------------------------------------------------------
// Agent tree node (recursive, flat visual style)
// ---------------------------------------------------------------------------

function AgentTreeRow({
  node,
  messageId,
  onToggle,
}: {
  node: AgentTreeNode;
  messageId: string;
  onToggle: (messageId: string, agentId: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  // Only parent nodes are expandable (to show children). Leaf content goes in the main chat.
  const isExpandable = hasChildren;

  return (
    <>
      {/* Row header */}
      <div className="agent-row">
        <div
          className={`agent-row-header ${isExpandable ? 'agent-row-header--clickable' : ''}`}
          onClick={() => isExpandable && onToggle(messageId, node.agentId)}
          role={isExpandable ? 'button' : undefined}
          tabIndex={isExpandable ? 0 : undefined}
          onKeyDown={(e) => {
            if (isExpandable && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onToggle(messageId, node.agentId);
            }
          }}
        >
          {isExpandable ? (
            <span className="agent-row-chevron">
              {node.expanded ? (
                <ExpandMoreIcon sx={{ fontSize: '0.875rem' }} />
              ) : (
                <ChevronRightIcon sx={{ fontSize: '0.875rem' }} />
              )}
            </span>
          ) : (
            <span className="agent-row-dot" />
          )}

          <span className="agent-row-name">{node.agentName}</span>

          <span className="agent-row-status">
            {node.status === 'running' && <Loader size={10} type="dots" />}
            {node.status === 'success' && (
              <CheckCircleOutlineIcon sx={{ fontSize: '0.75rem' }} className="agent-row-success" />
            )}
            {node.status === 'error' && (
              <ErrorOutlineIcon sx={{ fontSize: '0.75rem' }} className="agent-row-error" />
            )}
          </span>

          {node.resultSummary && (
            <span className="agent-row-summary">{node.resultSummary}</span>
          )}

          {node.durationMs != null && (
            <span className="agent-row-duration">{formatDuration(node.durationMs)}</span>
          )}
        </div>
      </div>

      {/* Expanded children (nested rows, visually flat) */}
      {hasChildren && (
        <Collapse in={node.expanded}>
          <div className="agent-row-children">
            {node.children.map((child) => (
              <AgentTreeRow
                key={child.agentId}
                node={child}
                messageId={messageId}
                onToggle={onToggle}
              />
            ))}
          </div>
        </Collapse>
      )}

    </>
  );
}

// ---------------------------------------------------------------------------
// Action approval bar
// ---------------------------------------------------------------------------

function ActionApprovalBar({
  messageId,
  decision,
  actionType,
  onAction,
  onAutoAccept,
}: {
  messageId: string;
  decision: ActionDecision;
  actionType?: string;
  onAction: (messageId: string, decision: ActionDecision, instructions?: string) => void;
  onAutoAccept?: (actionType: string) => void;
}) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [instructions, setInstructions] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showInstructions) inputRef.current?.focus();
  }, [showInstructions]);

  if (decision === 'accepted') {
    return (
      <div className="action-bar action-bar--resolved">
        <CheckCircleOutlineIcon sx={{ fontSize: '0.875rem' }} className="action-bar-accepted-icon" />
        <span className="action-bar-resolved-label">Action accepted</span>
      </div>
    );
  }

  if (decision === 'denied') {
    return (
      <div className="action-bar action-bar--resolved">
        <ErrorOutlineIcon sx={{ fontSize: '0.875rem' }} className="action-bar-denied-icon" />
        <span className="action-bar-resolved-label">Action denied</span>
      </div>
    );
  }

  return (
    <div className="action-bar">
      <div className="action-bar-buttons">
        <button className="action-btn action-btn--accept" onClick={() => onAction(messageId, 'accepted')}>
          Accept
        </button>
        <button
          className="action-btn action-btn--accept-always"
          onClick={() => {
            if (actionType && onAutoAccept) onAutoAccept(actionType);
            onAction(messageId, 'accepted');
          }}
          title="Accept and don't ask for approval again for this action type"
        >
          Accept always
        </button>
        <button className="action-btn action-btn--deny" onClick={() => onAction(messageId, 'denied')}>
          Deny
        </button>
        <button
          className="action-btn action-btn--deny-instruct"
          onClick={() => setShowInstructions(true)}
        >
          Deny with instructions
        </button>
      </div>

      {showInstructions && (
        <div className="action-bar-instructions">
          <input
            ref={inputRef}
            className="action-bar-instructions-input"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && instructions.trim()) {
                onAction(messageId, 'denied', instructions.trim());
              }
              if (e.key === 'Escape') {
                setShowInstructions(false);
                setInstructions('');
              }
            }}
            placeholder="Tell the agent what to do instead..."
          />
          <button
            className="action-btn action-btn--send-instructions"
            disabled={!instructions.trim()}
            onClick={() => {
              if (instructions.trim()) onAction(messageId, 'denied', instructions.trim());
            }}
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat message view
// ---------------------------------------------------------------------------

function ChatMessageView({
  msg,
  onToggleExpanded,
  onAction,
  onAutoAccept,
}: {
  msg: ChatMessage;
  onToggleExpanded: (messageId: string, agentId: string) => void;
  onAction: (messageId: string, decision: ActionDecision, instructions?: string) => void;
  onAutoAccept: (actionType: string) => void;
}) {
  if (msg.role === 'user') {
    return (
      <div className="agent-chat-msg agent-chat-msg--user">
        <div className="agent-chat-bubble">{msg.content}</div>
      </div>
    );
  }

  // Assistant message — full width, no bubble
  const hasTree = Boolean(msg.agentTree);

  return (
    <div className="agent-chat-msg agent-chat-msg--assistant">
      {/* Agent call accordion — shows which agents ran */}
      {hasTree && msg.agentTree && (
        <div className="agent-calls">
          <AgentTreeRow
            node={msg.agentTree}
            messageId={msg.id}
            onToggle={onToggleExpanded}
          />
        </div>
      )}

      {/* Loading indicator when no tree yet */}
      {msg.isStreaming && !msg.agentTree && (
        <div className="agent-chat-connecting">
          <Loader size={14} type="dots" />
          <span>Connecting to agents...</span>
        </div>
      )}

      {/* Response text — live during streaming, final after completion */}
      {(() => {
        // During streaming, pull content from the deepest tree node
        const displayContent = msg.content || (msg.agentTree ? findDeepestContent(msg.agentTree) : '');
        if (!displayContent) return null;
        return (
          <div className="agent-chat-response">
            <SimpleMarkdown content={displayContent} className="md-content" />
            {msg.isStreaming && <span className="agent-chat-stream-cursor">|</span>}
          </div>
        );
      })()}

      {/* Action approval buttons */}
      {!msg.isStreaming && msg.actionType && msg.actionDecision && (
        <ActionApprovalBar
          messageId={msg.id}
          decision={msg.actionDecision}
          actionType={msg.actionType}
          onAction={onAction}
          onAutoAccept={onAutoAccept}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick action chips
// ---------------------------------------------------------------------------

function QuickActionChips({
  agent,
  onSelect,
  disabled,
}: {
  agent: AgentDefinition;
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="agent-chat-quick-actions">
      {agent.quickActions.map((qa) => (
        <button
          key={qa.id}
          className="agent-chat-quick-chip"
          onClick={() => onSelect(qa.prompt)}
          title={qa.prompt}
          disabled={disabled}
        >
          {qa.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main AgentChat
// ---------------------------------------------------------------------------

interface AgentChatProps {
  agent: AgentDefinition;
  onBack: () => void;
}

export function AgentChat({ agent, onBack }: AgentChatProps) {
  const { messages, isStreaming, sessionId, isLoadingHistory } = useAgentChatState();
  const { sendMessage, cancelStream, clearChat, toggleNodeExpanded, handleAction, setAutoAccept,
          setCurrentAgent, openSession, deleteSession } = useAgentChatActions();
  const { activeFiles, consumeFiles, findFileId, selectors } = useFileContext();
  const [input, setInput] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Notify context which agent is open (triggers history auto-load on first open)
  useEffect(() => {
    setCurrentAgent(agent.id);
  }, [agent.id, setCurrentAgent]);

  // Close history view when a new message arrives
  const prevMessageCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessageCount.current && historyOpen) {
      setHistoryOpen(false);
    }
    prevMessageCount.current = messages.length;
  }, [messages.length, historyOpen]);

  // Cache extracted text to avoid re-extracting for every message
  const textCacheRef = useRef<{ fileKey: string; text: string } | null>(null);

  const handleSelectSession = useCallback((sid: string) => {
    openSession(sid);
    setHistoryOpen(false);
  }, [openSession]);

  const handleNewChat = useCallback(() => {
    clearChat();
    setHistoryOpen(false);
  }, [clearChat]);

  // Listen for files produced by agent actions and add them as new versions
  useEffect(() => { // eslint-disable-line react-hooks/exhaustive-deps
    const handler = async (e: Event) => {
      const { results, actionType } = (e as CustomEvent<{ results: ActionFileResult[]; actionType: string }>).detail;

      const inputFileIds: string[] = [];
      const outputFiles: ReturnType<typeof createStirlingFile>[] = [];
      const outputStubs: ReturnType<typeof createChildStub>[] = [];

      for (const result of results) {
        // Find the input file's ID in the workbench
        const inputId = findFileId(result.inputFile);
        if (!inputId) continue;

        const parentStub = selectors.getStirlingFileStub(inputId);
        if (!parentStub) continue;

        const outputFile = new File([result.outputBlob], result.outputFileName, { type: 'application/pdf' });

        // Generate thumbnail for the new version
        let thumbnail: string | undefined;
        try {
          const ab = await outputFile.arrayBuffer();
          const thumbResults = await thumbnailGenerationService.generateThumbnails(
            inputId, ab, [1], { scale: 1.0, quality: 0.9 }
          );
          thumbnail = thumbResults[0]?.thumbnail;
        } catch {
          // Continue without thumbnail
        }

        const operation = { toolId: actionType as any, timestamp: Date.now() };
        const childStub = createChildStub(parentStub, operation, outputFile, thumbnail);
        const stirlingFile = createStirlingFile(outputFile, childStub.id);

        inputFileIds.push(inputId);
        outputFiles.push(stirlingFile);
        outputStubs.push(childStub);
      }

      if (outputFiles.length > 0) {
        await consumeFiles(inputFileIds as any, outputFiles, outputStubs);
      }
    };
    window.addEventListener('agent-action-files', handler);
    return () => window.removeEventListener('agent-action-files', handler);
  }, [consumeFiles, findFileId, selectors]);

  // Listen for auto-execute events (from "Accept always" auto-acceptance)
  useEffect(() => {
    const handler = async (e: Event) => {
      const { actionType, actionPayload } = (e as CustomEvent).detail;
      try {
        const { executeAgentAction } = await import('@app/services/agentActionService');
        const results = await executeAgentAction(actionType, actionPayload, activeFiles);
        if (results.length > 0) {
          window.dispatchEvent(
            new CustomEvent('agent-action-files', { detail: { results, actionType } })
          );
        }
      } catch (err) {
        console.error('[AgentChat] Auto-execute failed:', err);
      }
    };
    window.addEventListener('agent-action-auto-execute', handler);
    return () => window.removeEventListener('agent-action-auto-execute', handler);
  }, [activeFiles]);

  // Listen for "deny with instructions" — send follow-up through normal flow (ref avoids ordering)
  const denyInstructionsRef = useRef<((text: string) => void) | null>(null);

  // Auto-scroll when new messages arrive (but not when viewing history)
  useEffect(() => {
    if (!historyOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, historyOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus input when switching back to chat mode
  useEffect(() => {
    if (!historyOpen) inputRef.current?.focus();
  }, [agent.id, historyOpen]);

  // Invalidate text cache when files change
  const fileKey = activeFiles.map((f) => `${f.name}:${f.size}`).join('|');
  useEffect(() => {
    if (textCacheRef.current && textCacheRef.current.fileKey !== fileKey) {
      textCacheRef.current = null;
    }
  }, [fileKey]);

  const getExtractedText = useCallback(async (): Promise<string> => {
    console.log('[AgentChat] activeFiles:', activeFiles.length, activeFiles.map(f => f.name));
    if (activeFiles.length === 0) return '';
    if (textCacheRef.current && textCacheRef.current.fileKey === fileKey) {
      return textCacheRef.current.text;
    }
    setIsExtracting(true);
    try {
      const text = await extractTextFromFiles(activeFiles);
      console.log('[AgentChat] Extracted text length:', text.length);
      textCacheRef.current = { fileKey, text };
      return text;
    } catch (err) {
      console.error('[AgentChat] Text extraction failed:', err);
      return '';
    } finally {
      setIsExtracting(false);
    }
  }, [activeFiles, fileKey]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming || isExtracting) return;
    const fileNames = activeFiles.map((f) => f.name);
    const text = input.trim();
    setInput('');
    const extractedText = await getExtractedText();
    console.log('[AgentChat] Sending:', { fileNames, extractedTextLength: extractedText?.length ?? 0 });
    sendMessage(text, fileNames, extractedText || undefined);
  }, [input, isStreaming, isExtracting, sendMessage, activeFiles, getExtractedText]);

  const handleQuickAction = useCallback(
    async (prompt: string) => {
      if (isStreaming || isExtracting) return;
      const fileNames = activeFiles.map((f) => f.name);
      const extractedText = await getExtractedText();
      sendMessage(prompt, fileNames, extractedText || undefined);
    },
    [isStreaming, isExtracting, sendMessage, activeFiles, getExtractedText]
  );

  // Wire up deny-with-instructions listener
  denyInstructionsRef.current = handleQuickAction;
  useEffect(() => {
    const handler = (e: Event) => {
      const { instructions } = (e as CustomEvent<{ instructions: string }>).detail;
      denyInstructionsRef.current?.(instructions);
    };
    window.addEventListener('agent-deny-with-instructions', handler);
    return () => window.removeEventListener('agent-deny-with-instructions', handler);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const hasMessages = messages.length > 0;

  return (
    <div className="agent-chat">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="agent-chat-header">
        <button className="agent-chat-back-btn" onClick={onBack} aria-label="Back to agents">
          <ArrowBackRoundedIcon sx={{ fontSize: '1rem' }} />
        </button>
        <div className="agent-chat-header-icon" style={{ color: agent.color }}>
          {resolveAgentIcon(agent.iconHint)}
        </div>
        <div className="agent-chat-header-info">
          <span className="agent-chat-header-name">{agent.name}</span>
          <span className="agent-chat-header-desc">{agent.shortDescription}</span>
        </div>
        <button
          className={`agent-chat-icon-btn${historyOpen ? ' agent-chat-icon-btn--active' : ''}`}
          onClick={() => setHistoryOpen((v) => !v)}
          aria-label="Chat history"
          title="Chat history"
        >
          <AccessTimeRoundedIcon sx={{ fontSize: '0.875rem' }} />
        </button>
        {hasMessages && !historyOpen && (
          <button
            className="agent-chat-icon-btn"
            onClick={clearChat}
            aria-label="Clear chat"
            title="Clear chat"
          >
            <DeleteOutlineRoundedIcon sx={{ fontSize: '0.875rem' }} />
          </button>
        )}
      </div>

      {/* ── History view ───────────────────────────────────── */}
      {historyOpen ? (
        <ChatHistoryView
          agentId={agent.id}
          currentSessionId={sessionId}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          onDeleteSession={deleteSession}
        />
      ) : (
        <>
      {/* ── Message area ─────────────────────────────────── */}
      <div className="agent-chat-messages" ref={scrollRef}>
        {isLoadingHistory ? (
          <div className="agent-chat-history-loading">
            <div className="agent-chat-dots"><span /><span /><span /></div>
          </div>
        ) : !hasMessages ? (
          <div className="agent-chat-empty">
            <div className="agent-chat-empty-icon" style={{ color: agent.color }}>
              {resolveAgentIcon(agent.iconHint)}
            </div>
            <p className="agent-chat-empty-title">{agent.name}</p>
            <p className="agent-chat-empty-desc">{agent.fullDescription}</p>
            <QuickActionChips agent={agent} onSelect={handleQuickAction} disabled={isStreaming} />
          </div>
        ) : null}

        {!isLoadingHistory && messages.map((msg) => (
          <ChatMessageView
            key={msg.id}
            msg={msg}
            onToggleExpanded={toggleNodeExpanded}
            onAction={(msgId, decision, instructions) => handleAction(msgId, decision, activeFiles, instructions)}
            onAutoAccept={setAutoAccept}
          />
        ))}
      </div>

      {/* ── Quick actions row (when there ARE messages) ───── */}
      {hasMessages && (
        <div className="agent-chat-quick-bar">
          {agent.quickActions.slice(0, 3).map((qa) => (
            <button
              key={qa.id}
              className="agent-chat-quick-chip agent-chat-quick-chip--small"
              onClick={() => handleQuickAction(qa.prompt)}
              disabled={isStreaming}
            >
              {qa.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Input bar ──────────────────────────────────────── */}
      <div className="agent-chat-input-bar">
        <textarea
          ref={inputRef}
          className="agent-chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isExtracting ? 'Extracting document text...' : `Ask ${agent.name}...`}
          rows={1}
          disabled={isStreaming || isExtracting}
        />
        {isStreaming ? (
          <button
            className="agent-chat-send-btn agent-chat-send-btn--cancel"
            onClick={cancelStream}
            aria-label="Cancel"
          >
            <StopCircleRoundedIcon sx={{ fontSize: '1rem' }} />
          </button>
        ) : (
          <button
            className="agent-chat-send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || isExtracting}
            aria-label="Send message"
          >
            <SendRoundedIcon sx={{ fontSize: '1rem' }} />
          </button>
        )}
      </div>
        </>
      )}
    </div>
  );
}
