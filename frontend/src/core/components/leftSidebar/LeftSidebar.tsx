import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { LeftSidebarHeader } from '@app/components/leftSidebar/LeftSidebarHeader';
import { LeftSidebarFileBrowser } from '@app/components/leftSidebar/LeftSidebarFileBrowser';
import { LeftSidebarFooter } from '@app/components/leftSidebar/LeftSidebarFooter';
import AppConfigModal from '@app/components/shared/AppConfigModal';

import '@app/components/leftSidebar/LeftSidebar.css';

interface LeftSidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function LeftSidebar({ collapsed = false, onToggleCollapse }: LeftSidebarProps) {
  const navigate = useNavigate();
  const [configModalOpen, setConfigModalOpen] = useState(false);

  const handleSettingsClick = () => {
    navigate('/settings/overview');
    setConfigModalOpen(true);
  };

  return (
    <>
      <div
        className={`left-sidebar${collapsed ? ' left-sidebar-collapsed' : ''}`}
        data-sidebar="left-sidebar"
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
      </div>

      <AppConfigModal opened={configModalOpen} onClose={() => setConfigModalOpen(false)} />
    </>
  );
}
