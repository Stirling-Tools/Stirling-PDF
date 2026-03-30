/**
 * AgentChat — the inline chat view for a single agent.
 *
 * Renders inside the right panel when an agent is open.
 * Shows: header with back button, quick-action chips, message history,
 * and a message input bar.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { useAgentContext } from '@app/contexts/AgentContext';
import { AgentDefinition } from '@app/data/agentRegistry';
import { resolveAgentIcon } from '@app/components/rightPanel/AgentIconMap';

import '@app/components/rightPanel/AgentChat.css';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function QuickActionChips({ agent, onSelect }: { agent: AgentDefinition; onSelect: (prompt: string) => void }) {
  return (
    <div className="agent-chat-quick-actions">
      {agent.quickActions.map((qa) => (
        <button
          key={qa.id}
          className="agent-chat-quick-chip"
          onClick={() => onSelect(qa.prompt)}
          title={qa.prompt}
        >
          {qa.label}
        </button>
      ))}
    </div>
  );
}

function ChatMessageBubble({ role, content, isStreaming }: { role: 'user' | 'agent' | 'system'; content: string; isStreaming?: boolean }) {
  return (
    <div className={`agent-chat-msg agent-chat-msg--${role}`}>
      <div className={`agent-chat-bubble agent-chat-bubble--${role}`}>
        {content}
        {isStreaming && <span className="agent-chat-typing-indicator" />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function AgentChat() {
  const { activeAgent, state, closeAgent, sendMessage, getRuntime, clearChat } = useAgentContext();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const agentId = state.activeAgentId;
  const runtime = agentId ? getRuntime(agentId) : null;
  const messages = runtime?.chatHistory ?? [];
  const isRunning = runtime?.status === 'running';

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Focus input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, [agentId]);

  const handleSend = useCallback(() => {
    if (!agentId || !input.trim() || isRunning) return;
    sendMessage(agentId, input.trim());
    setInput('');
  }, [agentId, input, isRunning, sendMessage]);

  const handleQuickAction = useCallback(
    (prompt: string) => {
      if (!agentId || isRunning) return;
      sendMessage(agentId, prompt);
    },
    [agentId, isRunning, sendMessage]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  if (!activeAgent || !agentId) return null;

  const hasMessages = messages.length > 0;

  return (
    <div className="agent-chat">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="agent-chat-header">
        <button className="agent-chat-back-btn" onClick={closeAgent} aria-label="Back to agents">
          <ArrowBackRoundedIcon sx={{ fontSize: '1rem' }} />
        </button>
        <div className="agent-chat-header-icon" style={{ color: activeAgent.color }}>
          {resolveAgentIcon(activeAgent.iconHint)}
        </div>
        <div className="agent-chat-header-info">
          <span className="agent-chat-header-name">{activeAgent.name}</span>
          <span className="agent-chat-header-desc">{activeAgent.shortDescription}</span>
        </div>
        {hasMessages && (
          <button
            className="agent-chat-clear-btn"
            onClick={() => clearChat(agentId)}
            aria-label="Clear chat"
            title="Clear chat"
          >
            <DeleteOutlineRoundedIcon sx={{ fontSize: '0.875rem' }} />
          </button>
        )}
      </div>

      {/* ── Message area ───────────────────────────────────── */}
      <div className="agent-chat-messages" ref={scrollRef}>
        {!hasMessages && (
          <div className="agent-chat-empty">
            <div className="agent-chat-empty-icon" style={{ color: activeAgent.color }}>
              {resolveAgentIcon(activeAgent.iconHint)}
            </div>
            <p className="agent-chat-empty-title">{activeAgent.name}</p>
            <p className="agent-chat-empty-desc">{activeAgent.fullDescription}</p>
            <QuickActionChips agent={activeAgent} onSelect={handleQuickAction} />
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            isStreaming={msg.isStreaming}
          />
        ))}

        {isRunning && (
          <div className="agent-chat-msg agent-chat-msg--agent">
            <div className="agent-chat-bubble agent-chat-bubble--agent agent-chat-bubble--thinking">
              <span className="agent-chat-dots">
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Quick actions row (when there ARE messages) ───── */}
      {hasMessages && (
        <div className="agent-chat-quick-bar">
          {activeAgent.quickActions.slice(0, 3).map((qa) => (
            <button
              key={qa.id}
              className="agent-chat-quick-chip agent-chat-quick-chip--small"
              onClick={() => handleQuickAction(qa.prompt)}
              disabled={isRunning}
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
          placeholder={`Ask ${activeAgent.name}...`}
          rows={1}
          disabled={isRunning}
        />
        <button
          className="agent-chat-send-btn"
          onClick={handleSend}
          disabled={!input.trim() || isRunning}
          aria-label="Send message"
        >
          <SendRoundedIcon sx={{ fontSize: '1rem' }} />
        </button>
      </div>
    </div>
  );
}
