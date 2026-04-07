import React, { useEffect, useRef, useState } from 'react';
import { Loader } from '@mantine/core';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { AgentTreeRow, findDeepestContent } from '@app/components/rightPanel/AgentTreeRow';
import { ActionApprovalBar } from '@app/components/rightPanel/ActionApprovalBar';
import { SimpleMarkdown } from '@app/components/rightPanel/SimpleMarkdown';
import type { ActionDecision, ChatMessage } from '@app/types/agentChat';

export function ChatMessageView({
  msg,
  onToggleExpanded,
  onAction,
  onAutoAccept,
  onSuggestionClick,
}: {
  msg: ChatMessage;
  onToggleExpanded: (messageId: string, agentId: string) => void;
  onAction: (messageId: string, decision: ActionDecision, instructions?: string) => void;
  onAutoAccept: (actionType: string) => void;
  onSuggestionClick?: (text: string, messageId: string, index: number) => void;
}) {
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherValue, setOtherValue] = useState('');
  const otherInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the inline input when it opens
  useEffect(() => {
    if (otherOpen) otherInputRef.current?.focus();
  }, [otherOpen]);

  if (msg.role === 'user') {
    return (
      <div className="agent-chat-msg agent-chat-msg--user">
        <div className="agent-chat-bubble">{msg.content}</div>
      </div>
    );
  }

  const hasTree = Boolean(msg.agentTree);
  const hasSelection = msg.selectedSuggestion !== undefined;
  const locked = hasSelection || otherOpen;

  const handleOtherSend = () => {
    if (!otherValue.trim() || !onSuggestionClick) return;
    // Find the index of the isOther chip
    const otherIdx = msg.suggestions?.findIndex((c) => c.isOther) ?? -1;
    onSuggestionClick(otherValue.trim(), msg.id, otherIdx >= 0 ? otherIdx : -1);
    setOtherOpen(false);
  };

  return (
    <div className={`agent-chat-msg agent-chat-msg--assistant${msg.isError ? ' agent-chat-msg--error' : ''}`}>
      {hasTree && msg.agentTree && (
        <div className="agent-calls">
          <AgentTreeRow
            node={msg.agentTree}
            messageId={msg.id}
            onToggle={onToggleExpanded}
          />
        </div>
      )}

      {msg.isStreaming && !msg.agentTree && (
        <div className="agent-chat-connecting">
          <Loader size={14} type="dots" />
          <span>Connecting to agents...</span>
        </div>
      )}

      {(() => {
        const displayContent = msg.content || (msg.agentTree ? findDeepestContent(msg.agentTree) : '');
        if (!displayContent) return null;
        return (
          <div className="agent-chat-response">
            <SimpleMarkdown content={displayContent} className="md-content" />
            {msg.isStreaming && <span className="agent-chat-stream-cursor">|</span>}
          </div>
        );
      })()}

      {/* AI-generated suggestion chips */}
      {!msg.isStreaming && msg.suggestions && msg.suggestions.length > 0 && (
        <div className="agent-chat-suggestions">
          {msg.suggestions.map((chip, i) => {
            const isSelected = msg.selectedSuggestion === i;
            const isDisabled = locked && !isSelected;

            let className = 'agent-chat-suggestion-chip';
            if (isSelected) className += ' agent-chat-suggestion-chip--selected';
            if (isDisabled) className += ' agent-chat-suggestion-chip--disabled';
            if (chip.isOther && otherOpen) className += ' agent-chat-suggestion-chip--selected';

            return (
              <button
                key={i}
                className={className}
                disabled={isDisabled}
                onClick={() => {
                  if (isDisabled) return;
                  if (chip.isOther) {
                    setOtherOpen(true);
                  } else {
                    onSuggestionClick?.(chip.label, msg.id, i);
                  }
                }}
              >
                {chip.label}
              </button>
            );
          })}

          {/* Inline text input for "other" option */}
          {otherOpen && !hasSelection && (
            <div className="agent-chat-other-input">
              <input
                ref={otherInputRef}
                className="agent-chat-other-input-field"
                value={otherValue}
                onChange={(e) => setOtherValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && otherValue.trim()) handleOtherSend();
                  if (e.key === 'Escape') { setOtherOpen(false); setOtherValue(''); }
                }}
                placeholder="Type your answer..."
              />
              <button
                className="agent-chat-other-send"
                disabled={!otherValue.trim()}
                onClick={handleOtherSend}
                aria-label="Send"
              >
                <SendRoundedIcon sx={{ fontSize: '0.875rem' }} />
              </button>
            </div>
          )}
        </div>
      )}

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
