import React from 'react';
import { useTranslation } from 'react-i18next';
import AppsIcon from '@mui/icons-material/AppsRounded';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useNavigationState, useNavigationActions } from '@app/contexts/NavigationContext';
import { useSidebarNavigation } from '@app/hooks/useSidebarNavigation';
import { handleUnlessSpecialClick } from '@app/utils/clickHandlers';
import QuickAccessButton from '@app/components/shared/quickAccessBar/QuickAccessButton';

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
  const { hasUnsavedChanges } = useNavigationState();
  const { actions: navigationActions } = useNavigationActions();
  const { getHomeNavigation } = useSidebarNavigation();

  const performNavigation = () => {
    setActiveButton('tools');
    // Preserve existing behavior used in QuickAccessBar header
    handleReaderToggle();
    handleBackToTools();
  };

  const handleClick = () => {
    if (hasUnsavedChanges) {
      navigationActions.requestNavigation(performNavigation);
      return;
    }
    performNavigation();
  };

  // Do not highlight All Tools when a specific tool is open (indicator is shown)
  const isActive = activeButton === 'tools' && !selectedToolKey && leftPanelView === 'toolPicker';

  const navProps = getHomeNavigation();

  const handleNavClick = (e: React.MouseEvent) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      navigationActions.requestNavigation(performNavigation);
      return;
    }
    handleUnlessSpecialClick(e, handleClick);
  };

  return (
    <div className="mt-4 mb-2">
      <QuickAccessButton
        icon={<AppsIcon sx={{ fontSize: isActive ? '1.875rem' : '1.5rem' }} />}
        label={t("quickAccess.allTools", "Tools")}
        isActive={isActive}
        onClick={handleNavClick}
        href={navProps.href}
        ariaLabel={t("quickAccess.allTools", "Tools")}
        textClassName="all-tools-text"
        component="a"
      />
    </div>
  );
};

export default AllToolsNavButton;

