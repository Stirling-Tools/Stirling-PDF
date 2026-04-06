import React from 'react';
import { AgentDefinition } from '@app/data/agentRegistry';
import { resolveAgentIcon } from '@app/components/rightPanel/AgentIconMap';

export type AgentRuntimeStatus = 'idle' | 'running' | 'error';

function StatusBadge({ status }: { status: AgentRuntimeStatus }) {
  if (status === 'running') {
    return <span className="right-panel-agent-badge running">Running</span>;
  }
  return null;
}

interface AgentItemProps {
  agent: AgentDefinition;
  runtimeStatus?: AgentRuntimeStatus;
  isGeneral?: boolean;
  onClick?: () => void;
}

export function AgentItem({ agent, runtimeStatus = 'idle', isGeneral, onClick }: AgentItemProps) {
  const isDisabled = !agent.implemented && !isGeneral;

  return (
    <div
      className={`right-panel-agent-item ${isGeneral ? 'right-panel-agent-item--general' : ''} ${isDisabled ? 'right-panel-agent-item--disabled' : ''}`}
      onClick={isDisabled ? undefined : onClick}
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      onKeyDown={(e) => { if (!isDisabled && (e.key === 'Enter' || e.key === ' ')) onClick?.(); }}
      aria-disabled={isDisabled}
    >
      <div
        className="right-panel-agent-icon"
        style={{
          background: isGeneral
            ? 'linear-gradient(135deg, var(--mantine-color-blue-1), var(--mantine-color-violet-1))'
            : 'var(--bg-hover)',
          color: agent.color,
        }}
      >
        {resolveAgentIcon(agent.iconHint)}
      </div>
      <div className="right-panel-agent-content">
        <div className="right-panel-agent-name-row">
          <span className="right-panel-agent-name">{agent.name}</span>
          {isGeneral && <span className="right-panel-agent-badge always-on">Always on</span>}
          {isDisabled && <span className="right-panel-agent-badge coming-soon">Coming soon</span>}
          {!isGeneral && !isDisabled && runtimeStatus !== 'idle' && <StatusBadge status={runtimeStatus} />}
        </div>
        <div className="right-panel-agent-meta">
          {agent.shortDescription}
        </div>
      </div>
    </div>
  );
}
