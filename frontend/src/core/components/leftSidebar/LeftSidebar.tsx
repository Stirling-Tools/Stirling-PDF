import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { LeftSidebarHeader } from '@app/components/leftSidebar/LeftSidebarHeader';
import { LeftSidebarFileBrowser } from '@app/components/leftSidebar/LeftSidebarFileBrowser';
import { LeftSidebarFooter } from '@app/components/leftSidebar/LeftSidebarFooter';
import { ResizeHandle } from '@app/components/shared/ResizeHandle';
import AppConfigModal from '@app/components/shared/AppConfigModal';

import '@app/components/leftSidebar/LeftSidebar.css';

interface LeftSidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function LeftSidebar({ collapsed = false, onToggleCollapse }: LeftSidebarProps) {
  const navigate = useNavigate();
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [width, setWidth] = useState(260);

  const handleSettingsClick = () => {
    navigate('/settings/overview');
    setConfigModalOpen(true);
  };

  return (
    <>
      <div
        className={`left-sidebar${collapsed ? ' left-sidebar-collapsed' : ''}`}
        data-sidebar="left-sidebar"
        style={!collapsed ? { '--left-sidebar-width': `${width}px` } as React.CSSProperties : undefined}
      >
        <LeftSidebarHeader
          onMenuClick={onToggleCollapse}
          collapsed={collapsed}
        />

        <div className="left-sidebar-scrollable">
          <LeftSidebarFileBrowser />
        </div>

        <LeftSidebarFooter
          onSettingsClick={handleSettingsClick}
          collapsed={collapsed}
        />

        {!collapsed && (
          <ResizeHandle
            side="right"
            currentWidth={width}
            minWidth={200}
            maxWidth={500}
            onResize={setWidth}
          />
        )}
      </div>

      <AppConfigModal opened={configModalOpen} onClose={() => setConfigModalOpen(false)} />
    </>
  );
}
