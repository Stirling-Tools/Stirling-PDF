import React, { useState, useRef, forwardRef, useEffect } from "react";
import { ActionIcon, Stack, Divider } from "@mantine/core";
import { useTranslation } from 'react-i18next';
import LocalIcon from './LocalIcon';
import { useRainbowThemeContext } from "./RainbowThemeProvider";
import AppConfigModal from './AppConfigModal';
import { useIsOverflowing } from '../../hooks/useIsOverflowing';
import { useFilesModalContext } from '../../contexts/FilesModalContext';
import { useToolWorkflow } from '../../contexts/ToolWorkflowContext';
import { ButtonConfig } from '../../types/sidebar';
import './quickAccessBar/QuickAccessBar.css';
import AllToolsNavButton from './AllToolsNavButton';
import ActiveToolButton from "./quickAccessBar/ActiveToolButton";
import {
  isNavButtonActive,
  getNavButtonStyle,
  getActiveNavButton,
} from './quickAccessBar/QuickAccessBar';

const QuickAccessBar = forwardRef<HTMLDivElement>(({
}, ref) => {
  const { t } = useTranslation();
  const { isRainbowMode } = useRainbowThemeContext();
  const { openFilesModal, isFilesModalOpen } = useFilesModalContext();
  const { handleReaderToggle, handleBackToTools, handleToolSelect, selectedToolKey, leftPanelView, toolRegistry, readerMode, resetTool } = useToolWorkflow();
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [activeButton, setActiveButton] = useState<string>('tools');
  const scrollableRef = useRef<HTMLDivElement>(null);
  const isOverflow = useIsOverflowing(scrollableRef);

  useEffect(() => {
    const next = getActiveNavButton(selectedToolKey, readerMode);
    setActiveButton(next);
  }, [leftPanelView, selectedToolKey, toolRegistry, readerMode]);

  const handleFilesButtonClick = () => {
    openFilesModal();
  };


  const buttonConfigs: ButtonConfig[] = [
    {
      id: 'read',
      name: t("quickAccess.read", "Read"),
      icon: <LocalIcon icon="menu-book-rounded" width="1.5rem" height="1.5rem" />,
      size: 'lg',
      isRound: false,
      type: 'navigation',
      onClick: () => {
        setActiveButton('read');
        handleBackToTools();
        handleReaderToggle();
      }
    },
    // TODO: Add sign
    //{
    //  id: 'sign',
    //  name: t("quickAccess.sign", "Sign"),
    //  icon: <LocalIcon icon="signature-rounded" width="1.25rem" height="1.25rem" />,
    //  size: 'lg',
    //  isRound: false,
    //  type: 'navigation',
    //  onClick: () => {
    //    setActiveButton('sign');
    //    handleToolSelect('sign');
    //  }
    //},
    {
      id: 'automate',
      name: t("quickAccess.automate", "Automate"),
      icon: <LocalIcon icon="automation-outline" width="1.6rem" height="1.6rem" />,
      size: 'lg',
      isRound: false,
      type: 'navigation',
      onClick: () => {
        setActiveButton('automate');
        // If already on automate tool, reset it directly
        if (selectedToolKey === 'automate') {
          resetTool('automate');
        } else {
          handleToolSelect('automate');
        }
      }
    },
    {
      id: 'files',
      name: t("quickAccess.files", "Files"),
      icon: <LocalIcon icon="folder-rounded" width="1.6rem" height="1.6rem" />,
      isRound: true,
      size: 'lg',
      type: 'modal',
      onClick: handleFilesButtonClick
    },
    //TODO: Activity
    //{
    //  id: 'activity',
    //  name: t("quickAccess.activity", "Activity"),
    //  icon: <LocalIcon icon="vital-signs-rounded" width="1.25rem" height="1.25rem" />,
    //  isRound: true,
    //  size: 'lg',
    //  type: 'navigation',
    //  onClick: () => setActiveButton('activity')
    //},
    {
      id: 'config',
      name: t("quickAccess.config", "Config"),
      icon: <LocalIcon icon="settings-rounded" width="1.25rem" height="1.25rem" />,
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
        <ActiveToolButton activeButton={activeButton} setActiveButton={setActiveButton} />
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

                  <div className="flex flex-col items-center gap-1" style={{ marginTop: index === 0 ? '0.5rem' : "0rem" }}>
                    <ActionIcon
                      size={isNavButtonActive(config, activeButton, isFilesModalOpen, configModalOpen, selectedToolKey, leftPanelView) ? (config.size || 'lg') : 'lg'}
                      variant="subtle"
                       onClick={() => {
                         config.onClick();
                       }}
                      style={getNavButtonStyle(config, activeButton, isFilesModalOpen, configModalOpen, selectedToolKey, leftPanelView)}
                      className={isNavButtonActive(config, activeButton, isFilesModalOpen, configModalOpen, selectedToolKey, leftPanelView) ? 'activeIconScale' : ''}
                      data-testid={`${config.id}-button`}
                    >
                      <span className="iconContainer">
                        {config.icon}
                      </span>
                    </ActionIcon>
                    <span className={`button-text ${isNavButtonActive(config, activeButton, isFilesModalOpen, configModalOpen, selectedToolKey, leftPanelView) ? 'active' : 'inactive'}`}>
                      {config.name}
                    </span>
                  </div>


                {/* Add divider after Automate button (index 1) and Files button (index 2) */}
                {index === 1 && (
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
          {/* {buttonConfigs
            .filter(config => config.id === 'config')
            .map(config => (
                <div className="flex flex-col items-center gap-1">
                  <ActionIcon
                    size={config.size || 'lg'}
                    variant="subtle"
                    onClick={config.onClick}
                    style={getNavButtonStyle(config, activeButton, isFilesModalOpen, configModalOpen, selectedToolKey, leftPanelView)}
                    className={isNavButtonActive(config, activeButton, isFilesModalOpen, configModalOpen, selectedToolKey, leftPanelView) ? 'activeIconScale' : ''}
                    data-testid={`${config.id}-button`}
                  >
                    <span className="iconContainer">
                      {config.icon}
                    </span>
                  </ActionIcon>
                  <span className={`button-text ${isNavButtonActive(config, activeButton, isFilesModalOpen, configModalOpen, selectedToolKey, leftPanelView) ? 'active' : 'inactive'}`}>
                    {config.name}
                  </span>
                </div>
            ))} */}
        </div>
      </div>

      {/* <AppConfigModal
        opened={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
      /> */}
    </div>
  );
});

export default QuickAccessBar;
