import React, { useState } from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';

interface SidebarSectionProps {
  label: string;
  children: React.ReactNode;
  // Files-style header: count on hover + upload + expand
  fileCount?: number;
  onAdd?: () => void;
  onExpand?: () => void;
  // Legacy view-all link (watch folders etc)
  onViewAll?: () => void;
  viewAllLabel?: string;
}

export function SidebarSection({
  label,
  children,
  fileCount,
  onAdd,
  onExpand,
  onViewAll,
  viewAllLabel = 'View all →',
}: SidebarSectionProps) {
  const [hovered, setHovered] = useState(false);
  const isFilesHeader = onAdd !== undefined || onExpand !== undefined;

  return (
    <div className="left-sidebar-section">
      <div
        className="left-sidebar-section-header"
        onMouseEnter={() => isFilesHeader && setHovered(true)}
        onMouseLeave={() => isFilesHeader && setHovered(false)}
      >
        <span className="left-sidebar-section-label">{label}</span>

        {isFilesHeader ? (
          <>
            {onExpand && (
              <button
                className="left-sidebar-section-icon-btn left-sidebar-section-expand-btn"
                onClick={onExpand}
                title="Open file picker"
                aria-label="Open file picker"
                style={{ marginLeft: '0.25rem' }}
              >
                <OpenInNewRoundedIcon sx={{ fontSize: '0.8125rem' }} />
              </button>
            )}
            <div style={{ flex: 1 }} />
            <div
              className={`left-sidebar-section-files-actions${!hovered ? ' left-sidebar-section-files-actions--hidden' : ''}`}
              aria-hidden={!hovered}
            >
              {fileCount !== undefined && (
                <span className="left-sidebar-section-count">{fileCount}</span>
              )}
              {onAdd && (
                <button
                  className="left-sidebar-section-icon-btn"
                  onClick={onAdd}
                  title="Upload from computer"
                  aria-label="Upload from computer"
                >
                  <AddRoundedIcon sx={{ fontSize: '0.875rem' }} />
                </button>
              )}
            </div>
          </>
        ) : onViewAll ? (
          <button className="left-sidebar-section-view-all" onClick={onViewAll}>
            {viewAllLabel}
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}
