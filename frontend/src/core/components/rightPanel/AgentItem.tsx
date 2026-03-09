import React from 'react';

export type AgentStatus = 'always-on' | 'running' | 'idle';

export interface Agent {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status?: AgentStatus;
  meta?: string;
}

function StatusBadge({ status }: { status: AgentStatus }) {
  if (status === 'always-on') {
    return <span className="right-panel-agent-badge always-on">Always on</span>;
  }
  if (status === 'running') {
    return <span className="right-panel-agent-badge running">Running</span>;
  }
  return null;
}

interface AgentItemProps {
  agent: Agent;
  onClick?: () => void;
}

export function AgentItem({ agent, onClick }: AgentItemProps) {
  return (
    <div className="right-panel-agent-item" onClick={onClick} role="button" tabIndex={0}>
      <div className="right-panel-agent-icon" style={{ background: 'var(--mantine-color-blue-1)' }}>
        {agent.icon}
      </div>
      <div className="right-panel-agent-content">
        <div className="right-panel-agent-name-row">
          <span className="right-panel-agent-name">{agent.name}</span>
          {agent.status && agent.status !== 'idle' && <StatusBadge status={agent.status} />}
        </div>
        <div className="right-panel-agent-meta">
          {agent.meta || agent.description}
        </div>
      </div>
    </div>
  );
}
