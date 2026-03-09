import React from 'react';

interface ToolItemProps {
  icon: React.ReactNode;
  name: string;
  description: string;
  onClick: () => void;
}

export function ToolItem({ icon, name, description, onClick }: ToolItemProps) {
  return (
    <div className="right-panel-tool-item" onClick={onClick} role="button" tabIndex={0}>
      <div className="right-panel-tool-icon">{icon}</div>
      <div className="right-panel-tool-content">
        <div className="right-panel-tool-name">{name}</div>
        <div className="right-panel-tool-description">{description}</div>
      </div>
    </div>
  );
}
