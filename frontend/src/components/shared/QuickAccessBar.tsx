import React, { useState, useRef, forwardRef, useEffect } from "react";
import { ActionIcon, Stack, Divider } from "@mantine/core";
import { useTranslation } from 'react-i18next';
import LocalIcon from './LocalIcon';
import { useRainbowThemeContext } from "./RainbowThemeProvider";
import { useIsOverflowing } from '../../hooks/useIsOverflowing';
import { useFilesModalContext } from '../../contexts/FilesModalContext';
import { useToolWorkflow } from '../../contexts/ToolWorkflowContext';
import { useSidebarNavigation } from '../../hooks/useSidebarNavigation';
import { handleUnlessSpecialClick } from '../../utils/clickHandlers';
import { ButtonConfig } from '../../types/sidebar';
import './quickAccessBar/QuickAccessBar.css';
import AllToolsNavButton from './AllToolsNavButton';
import ActiveToolButton from "./quickAccessBar/ActiveToolButton";
import AppConfigModal from './AppConfigModal';
import { useAppConfig } from '../../contexts/AppConfigContext';
import { useOnboarding } from '../../contexts/OnboardingContext';
import {
  isNavButtonActive,
  getNavButtonStyle,
  getActiveNavButton,
} from './quickAccessBar/QuickAccessBar';

const QuickAccessBar = forwardRef<HTMLDivElement>((_, ref) => {
  const { t } = useTranslation();
  const { isRainbowMode } = useRainbowThemeContext();
  const { openFilesModal, isFilesModalOpen } = useFilesModalContext();
  const { handleReaderToggle, handleToolSelect, selectedToolKey, leftPanelView, toolRegistry, readerMode, resetTool } = useToolWorkflow();
  const { getToolNavigation } = useSidebarNavigation();
  const { config } = useAppConfig();
  const { startTour } = useOnboarding();
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

  // Helper function to render navigation buttons with URL support
  const renderNavButton = (config: ButtonConfig, index: number) => {
    const isActive = isNavButtonActive(config, activeButton, isFilesModalOpen, configModalOpen, selectedToolKey, leftPanelView);

    // Check if this button has URL navigation support
    const navProps = config.type === 'navigation' && (config.id === 'read' || config.id === 'automate')
      ? getToolNavigation(config.id)
      : null;

    const handleClick = (e?: React.MouseEvent) => {
      if (navProps && e) {
        handleUnlessSpecialClick(e, config.onClick);
      } else {
        config.onClick();
      }
    };

    // Render navigation button with conditional URL support
    return (
      <div
        key={config.id}
        className="flex flex-col items-center gap-1"
        style={{ marginTop: index === 0 ? '0.5rem' : "0rem" }}
        data-tour={`${config.id}-button`}
      >
        <ActionIcon
          {...(navProps ? {
            component: "a" as const,
            href: navProps.href,
            onClick: (e: React.MouseEvent) => handleClick(e),
            'aria-label': config.name
          } : {
            onClick: () => handleClick(),
            'aria-label': config.name
          })}
          size={isActive ? (config.size || 'lg') : 'lg'}
          variant="subtle"
          style={getNavButtonStyle(config, activeButton, isFilesModalOpen, configModalOpen, selectedToolKey, leftPanelView)}
          className={isActive ? 'activeIconScale' : ''}
          data-testid={`${config.id}-button`}
        >
          <span className="iconContainer">
            {config.icon}
          </span>
        </ActionIcon>
        <span className={`button-text ${isActive ? 'active' : 'inactive'}`}>
          {config.name}
        </span>
      </div>
    );
  };

  const mainButtons: ButtonConfig[] = [
    {
      id: 'read',
      name: t("quickAccess.read", "Read"),
      icon: <LocalIcon icon="menu-book-rounded" width="1.5rem" height="1.5rem" />,
      size: 'lg',
      isRound: false,
      type: 'navigation',
      onClick: () => {
        setActiveButton('read');
        handleReaderToggle();
      }
    },
    // {
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
    // },
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
  ];

  const middleButtons: ButtonConfig[] = [
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
  ];

  const bottomButtons: ButtonConfig[] = [
    {
      id: 'help',
      name: t("quickAccess.help", "Help"),
      icon: <LocalIcon icon="help-rounded" width="1.5rem" height="1.5rem" />,
      isRound: true,
      size: 'lg',
      type: 'action',
      onClick: () => {
        startTour();
      },
    },
    {
      id: 'config',
      name: config?.enableLogin ? t("quickAccess.account", "Account") : t("quickAccess.config", "Config"),
      icon: config?.enableLogin ? <LocalIcon icon="person-rounded" width="1.25rem" height="1.25rem" /> : <LocalIcon icon="settings-rounded" width="1.25rem" height="1.25rem" />,
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
          {/* Main navigation section */}
          <Stack gap="lg" align="center">
            {mainButtons.map((config, index) => (
              <React.Fragment key={config.id}>
                {renderNavButton(config, index)}
              </React.Fragment>
            ))}
          </Stack>

          {/* Divider after main buttons */}
          <Divider
            size="xs"
            className="content-divider"
          />

          {/* Middle section */}
          <Stack gap="lg" align="center">
            {middleButtons.map((config, index) => (
              <React.Fragment key={config.id}>
                {renderNavButton(config, index)}
              </React.Fragment>
            ))}
          </Stack>

          {/* Spacer to push bottom buttons to bottom */}
          <div className="spacer" />

          {/* Bottom section */}
          <Stack gap="lg" align="center">
            {bottomButtons.map((config, index) => (
              <React.Fragment key={config.id}>
                {renderNavButton(config, index)}
              </React.Fragment>
            ))}
          </Stack>
        </div>
      </div>

      <AppConfigModal
        opened={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
      />
    </div>
  );
});

QuickAccessBar.displayName = 'QuickAccessBar';

export default QuickAccessBar;
