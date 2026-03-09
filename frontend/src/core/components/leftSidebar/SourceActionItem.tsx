import React, { useState } from 'react';

interface SourceActionItemProps {
  /** Pass a function to receive hover state, or a plain ReactNode */
  icon: React.ReactNode | ((hovered: boolean) => React.ReactNode);
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export function SourceActionItem({ icon, label, onClick, disabled }: SourceActionItemProps) {
  const [hovered, setHovered] = useState(false);
  const resolvedIcon = typeof icon === 'function' ? icon(hovered) : icon;

  return (
    <button
      className="left-sidebar-source-action"
      onClick={onClick}
      disabled={disabled}
      style={{ opacity: disabled ? 0.4 : 1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="left-sidebar-source-action-icon">{resolvedIcon}</span>
      <span className="left-sidebar-source-action-label">{label}</span>
    </button>
  );
}
