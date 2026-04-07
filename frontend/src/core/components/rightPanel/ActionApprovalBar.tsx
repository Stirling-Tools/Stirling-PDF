import React, { useEffect, useRef, useState } from 'react';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import type { ActionDecision } from '@app/types/agentChat';

export function ActionApprovalBar({
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
