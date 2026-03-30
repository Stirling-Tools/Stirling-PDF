import React from 'react';
import { AgentDefinition, AgentId } from '@app/data/agentRegistry';
import { AgentRuntimeStatus } from '@app/contexts/AgentContext';
import { resolveAgentIcon } from '@app/components/rightPanel/AgentIconMap';

// Re-export for backward compat (other files may import Agent from here)
export type { AgentDefinition as Agent };
export type { AgentRuntimeStatus as AgentStatus };

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
  return (
    <div
      className={`right-panel-agent-item ${isGeneral ? 'right-panel-agent-item--general' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); }}
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
          {!isGeneral && runtimeStatus !== 'idle' && <StatusBadge status={runtimeStatus} />}
        </div>
        <div className="right-panel-agent-meta">
          {agent.shortDescription}
        </div>
      </div>
    </div>
  );
}
