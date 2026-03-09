import React from 'react';

interface RightPanelSectionProps {
  label: string;
  onViewAll?: () => void;
  viewAllLabel?: string;
  children: React.ReactNode;
}

export function RightPanelSection({ label, onViewAll, viewAllLabel = 'View All →', children }: RightPanelSectionProps) {
  return (
    <div className="right-panel-section">
      <div className="right-panel-section-header">
        <span className="right-panel-section-label">{label}</span>
        {onViewAll && (
          <button className="right-panel-view-all" onClick={onViewAll}>
            {viewAllLabel}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
