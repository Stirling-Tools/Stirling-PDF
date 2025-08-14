import React, { useState, useRef, forwardRef, useEffect } from "react";
import { ActionIcon, Stack, Divider } from "@mantine/core";
import MenuBookIcon from "@mui/icons-material/MenuBookRounded";
import SettingsIcon from "@mui/icons-material/SettingsRounded";
import FolderIcon from "@mui/icons-material/FolderRounded";
import { useRainbowThemeContext } from "./RainbowThemeProvider";
import AppConfigModal from './AppConfigModal';
import { useIsOverflowing } from '../../hooks/useIsOverflowing';
import { useFilesModalContext } from '../../contexts/FilesModalContext';
import { useToolWorkflow } from '../../contexts/ToolWorkflowContext';
import { ButtonConfig } from '../../types/sidebar';
import './quickAccessBar/QuickAccessBar.css';
import AllToolsNavButton from './AllToolsNavButton';
import { Tooltip } from './Tooltip';
import TopToolIndicator from './quickAccessBar/TopToolIndicator';
import { 
  isNavButtonActive, 
  getNavButtonStyle, 
  getTargetNavButton 
} from './quickAccessBar/QuickAccessBar';

const QuickAccessBar = forwardRef<HTMLDivElement>(({
}, ref) => {
  const { isRainbowMode } = useRainbowThemeContext();
  const { openFilesModal, isFilesModalOpen } = useFilesModalContext();
  const { handleReaderToggle, selectedTool, leftPanelView } = useToolWorkflow();
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [activeButton, setActiveButton] = useState<string>('tools');
  const scrollableRef = useRef<HTMLDivElement>(null);
  const isOverflow = useIsOverflowing(scrollableRef);

  // Sync left nav highlight with selected tool when appropriate
  useEffect(() => {
    if (leftPanelView === 'toolContent' && selectedTool) {
      const target = getTargetNavButton(selectedTool);

      if (target && activeButton !== target) {
        setActiveButton(target);
        return;
      }
      // If tool doesn't map to a nav button, clear the highlight
      if (!target && activeButton !== 'tools') {
        setActiveButton('tools');
      }
    }
    // Revert highlight when no specific mapping applies
    if (leftPanelView !== 'toolContent') {
      setActiveButton('tools');
    }
  }, [leftPanelView, selectedTool?.view, selectedTool?.subcategory]);

  const handleFilesButtonClick = () => {
    openFilesModal();
  };

  const buttonConfigs: ButtonConfig[] = [
    {
      id: 'read',
      name: 'Read',
      icon: <MenuBookIcon sx={{ fontSize: "1.5rem" }} />,
      tooltip: 'Read documents',
      size: 'lg',
      isRound: false,
      type: 'navigation',
      onClick: () => {
        setActiveButton('read');
        handleReaderToggle();
      }
    },
    {
      id: 'sign',
      name: 'Sign',
      icon:
        <span className="material-symbols-rounded font-size-20">
          signature
        </span>,
      tooltip: 'Sign your document',
      size: 'lg',
      isRound: false,
      type: 'navigation',
      onClick: () => setActiveButton('sign')
    },
    {
      id: 'automate',
      name: 'Automate',
      icon:
        <span className="material-symbols-rounded font-size-20">
          automation
        </span>,
      tooltip: 'Automate workflows',
      size: 'lg',
      isRound: false,
      type: 'navigation',
      onClick: () => setActiveButton('automate')
    },
    {
      id: 'files',
      name: 'Files',
      icon: <FolderIcon sx={{ fontSize: "1.25rem" }} />,
      tooltip: 'Manage files',
      isRound: true,
      size: 'lg',
      type: 'modal',
      onClick: handleFilesButtonClick
    },
    {
      id: 'activity',
      name: 'Activity',
      icon:
        <span className="material-symbols-rounded font-size-20">
          vital_signs
        </span>,
      tooltip: 'View activity and analytics',
      isRound: true,
      size: 'lg',
      type: 'navigation',
      onClick: () => setActiveButton('activity')
    },
    {
      id: 'config',
      name: 'Config',
      icon: <SettingsIcon sx={{ fontSize: "1rem" }} />,
      tooltip: 'Configure settings',
      size: 'lg',
      type: 'modal',
      onClick: () => {
        setConfigModalOpen(true);
      }
    }
  ];



  return (
    <div
      ref={ref}
      data-sidebar="quick-access"
      className={`h-screen flex flex-col w-20 quick-access-bar-main ${isRainbowMode ? 'rainbow-mode' : ''}`}
      style={{
        borderRight: '1px solid var(--border-default)'
      }}
    >
      {/* Fixed header outside scrollable area */}
      <div className="quick-access-header">
        <TopToolIndicator activeButton={activeButton} setActiveButton={setActiveButton} />
        <AllToolsNavButton activeButton={activeButton} setActiveButton={setActiveButton} />

      </div>

      {/* Conditional divider when overflowing */}
      {isOverflow && (
        <Divider
          size="xs"
          className="overflow-divider"
        />
      )}

      {/* Scrollable content area */}
      <div
        ref={scrollableRef}
        className="quick-access-bar flex-1"
        onWheel={(e) => {
          // Prevent the wheel event from bubbling up to parent containers
          e.stopPropagation();
        }}
      >
        <div className="scrollable-content">
          {/* Top section with main buttons */}
          <Stack gap="lg" align="center">
            {buttonConfigs.slice(0, -1).map((config, index) => (
              <React.Fragment key={config.id}>
                <Tooltip content={config.tooltip} position="right" arrow containerStyle={{ marginTop: "-1rem" }} maxWidth={200}>
                  <div className="flex flex-col items-center gap-1" style={{ marginTop: index === 0 ? '0.5rem' : "0rem" }}>
                    <ActionIcon
                      size={isNavButtonActive(config, activeButton, isFilesModalOpen, configModalOpen) ? (config.size || 'xl') : 'lg'}
                      variant="subtle"
                       onClick={() => {
                         config.onClick();
                       }}
                      style={getNavButtonStyle(config, activeButton, isFilesModalOpen, configModalOpen)}
                      className={isNavButtonActive(config, activeButton, isFilesModalOpen, configModalOpen) ? 'activeIconScale' : ''}
                      data-testid={`${config.id}-button`}
                    >
                      <span className="iconContainer">
                        {config.icon}
                      </span>
                    </ActionIcon>
                    <span className={`button-text ${isNavButtonActive(config, activeButton, isFilesModalOpen, configModalOpen) ? 'active' : 'inactive'}`}>
                      {config.name}
                    </span>
                  </div>
                </Tooltip>

                {/* Add divider after Automate button (index 2) */}
                {index === 2 && (
                  <Divider
                    size="xs"
                    className="content-divider"
                  />
                )}
              </React.Fragment>
            ))}
          </Stack>

          {/* Spacer to push Config button to bottom */}
          <div className="spacer" />

          {/* Config button at the bottom */}
          {buttonConfigs
            .filter(config => config.id === 'config')
            .map(config => (
              <Tooltip key={config.id} content={config.tooltip} sidebarTooltip>
                <div className="flex flex-col items-center gap-1">
                  <ActionIcon
                    size={config.size || 'lg'}
                    variant="subtle"
                    onClick={config.onClick}
                    style={getNavButtonStyle(config, activeButton, isFilesModalOpen, configModalOpen)}
                    className={isNavButtonActive(config, activeButton, isFilesModalOpen, configModalOpen) ? 'activeIconScale' : ''}
                    data-testid={`${config.id}-button`}
                  >
                    <span className="iconContainer">
                      {config.icon}
                    </span>
                  </ActionIcon>
                  <span className={`button-text ${isNavButtonActive(config, activeButton, isFilesModalOpen, configModalOpen) ? 'active' : 'inactive'}`}>
                    {config.name}
                  </span>
                </div>
              </Tooltip>
            ))}
        </div>
      </div>

      <AppConfigModal
        opened={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
      />
    </div>
  );
});

export default QuickAccessBar;