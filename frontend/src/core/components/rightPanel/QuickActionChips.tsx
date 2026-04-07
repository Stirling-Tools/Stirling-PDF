import React from 'react';
import type { AgentDefinition } from '@app/data/agentRegistry';

export function QuickActionChips({
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
