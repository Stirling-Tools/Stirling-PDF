import React from 'react';
import { ActionIcon, Anchor } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Tooltip } from './Tooltip';
import AppsIcon from '@mui/icons-material/AppsRounded';
import { useToolWorkflow } from '../../contexts/ToolWorkflowContext';
import { useSidebarNavigation } from '../../hooks/useSidebarNavigation';

interface AllToolsNavButtonProps {
  activeButton: string;
  setActiveButton: (id: string) => void;
}

const AllToolsNavButton: React.FC<AllToolsNavButtonProps> = ({ activeButton, setActiveButton }) => {
  const { t } = useTranslation();
  const { handleReaderToggle, handleBackToTools, selectedToolKey, leftPanelView } = useToolWorkflow();
  const { getHomeNavigation } = useSidebarNavigation();

  const handleClick = () => {
    setActiveButton('tools');
    // Preserve existing behavior used in QuickAccessBar header
    handleReaderToggle();
    handleBackToTools();
  };

  // Do not highlight All Tools when a specific tool is open (indicator is shown)
  const isActive = activeButton === 'tools' && !selectedToolKey && leftPanelView === 'toolPicker';

  const navProps = getHomeNavigation();

  const handleNavClick = (e: React.MouseEvent) => {
    // Check if it's a special click (middle click, ctrl+click, etc.)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) {
      return; // Let browser handle it via href
    }

    // For regular clicks, prevent default and use SPA navigation
    e.preventDefault();
    handleClick();
  };

  const iconNode = (
    <span className="iconContainer">
      <AppsIcon sx={{ fontSize: '2rem' }} />
    </span>
  );

  return (
    <Tooltip content={t("quickAccess.allTools", "All Tools")} position="right" arrow containerStyle={{ marginTop: "-1rem" }} maxWidth={200}>
      <Anchor
        href={navProps.href}
        onClick={handleNavClick}
        style={{ textDecoration: 'none', color: 'inherit' }}
      >
        <div className="flex flex-col items-center gap-1 mt-4 mb-2">
          <ActionIcon
            size={'lg'}
            variant="subtle"
            style={{
              backgroundColor: isActive ? 'var(--icon-tools-bg)' : 'var(--icon-inactive-bg)',
              color: isActive ? 'var(--icon-tools-color)' : 'var(--icon-inactive-color)',
              border: 'none',
              borderRadius: '8px',
            }}
            className={isActive ? 'activeIconScale' : ''}
          >
            {iconNode}
          </ActionIcon>
          <span className={`all-tools-text ${isActive ? 'active' : 'inactive'}`}>
            {t("quickAccess.allTools", "All Tools")}
          </span>
        </div>
      </Anchor>
    </Tooltip>
  );
};

export default AllToolsNavButton;


