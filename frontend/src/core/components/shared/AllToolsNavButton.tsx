import React from 'react';
import { ActionIcon } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@app/components/shared/Tooltip';
import AppsIcon from '@mui/icons-material/AppsRounded';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useSidebarNavigation } from '@app/hooks/useSidebarNavigation';
import { handleUnlessSpecialClick } from '@app/utils/clickHandlers';

interface AllToolsNavButtonProps {
  activeButton: string;
  setActiveButton: (id: string) => void;
  tooltipPosition?: 'left' | 'right' | 'top' | 'bottom';
}

const AllToolsNavButton: React.FC<AllToolsNavButtonProps> = ({
  activeButton,
  setActiveButton,
  tooltipPosition = 'right'
}) => {
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
    handleUnlessSpecialClick(e, handleClick);
  };

  const iconNode = (
    <span className="iconContainer">
      <AppsIcon sx={{ fontSize: isActive ? '1.875rem' : '1.5rem' }} />
    </span>
  );

  return (
    <Tooltip
      content={t("quickAccess.allTools", "Tools")}
      position={tooltipPosition}
      arrow
      containerStyle={{ marginTop: "-1rem" }}
      maxWidth={200}
    >
      <div className="flex flex-col items-center gap-1 mt-4 mb-2">
        <ActionIcon
          component="a"
          href={navProps.href}
          onClick={handleNavClick}
          size={isActive ? 'lg' : 'md'}
          variant="subtle"
          aria-label={t("quickAccess.allTools", "Tools")}
          style={{
            backgroundColor: isActive ? 'var(--icon-tools-bg)' : 'var(--icon-inactive-bg)',
            color: isActive ? 'var(--icon-tools-color)' : 'var(--icon-inactive-color)',
            border: 'none',
            borderRadius: '8px',
            textDecoration: 'none'
          }}
          className={isActive ? 'activeIconScale' : ''}
        >
          {iconNode}
        </ActionIcon>
        <span className={`all-tools-text ${isActive ? 'active' : 'inactive'}`}>
          {t("quickAccess.allTools", "Tools")}
        </span>
      </div>
    </Tooltip>
  );
};

export default AllToolsNavButton;

