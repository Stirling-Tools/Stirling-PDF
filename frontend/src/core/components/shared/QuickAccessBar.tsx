import React, { useState, useRef, forwardRef, useEffect } from "react";
import { Stack, Divider, Menu, Indicator } from "@mantine/core";
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import LocalIcon from '@app/components/shared/LocalIcon';
import { useRainbowThemeContext } from "@app/components/shared/RainbowThemeProvider";
import { useFilesModalContext } from '@app/contexts/FilesModalContext';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useNavigationState, useNavigationActions } from '@app/contexts/NavigationContext';
import { useSidebarNavigation } from '@app/hooks/useSidebarNavigation';
import { handleUnlessSpecialClick } from '@app/utils/clickHandlers';
import { ButtonConfig } from '@app/types/sidebar';
import '@app/components/shared/quickAccessBar/QuickAccessBar.css';
import { Tooltip } from '@app/components/shared/Tooltip';
import AllToolsNavButton from '@app/components/shared/AllToolsNavButton';
import ActiveToolButton from "@app/components/shared/quickAccessBar/ActiveToolButton";
import AppConfigModal from '@app/components/shared/AppConfigModal';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { useLicenseAlert } from "@app/hooks/useLicenseAlert";
import { requestStartTour } from '@app/constants/events';
import QuickAccessButton from '@app/components/shared/quickAccessBar/QuickAccessButton';
import { useToursTooltip } from '@app/components/shared/quickAccessBar/useToursTooltip';

import {
  isNavButtonActive,
  getNavButtonStyle,
  getActiveNavButton,
} from '@app/components/shared/quickAccessBar/QuickAccessBar';
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from '@app/styles/zIndex';

const QuickAccessBar = forwardRef<HTMLDivElement>((_, ref) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { isRainbowMode } = useRainbowThemeContext();
  const { openFilesModal, isFilesModalOpen } = useFilesModalContext();
  const { handleReaderToggle, handleToolSelect, selectedToolKey, leftPanelView, toolRegistry, readerMode, resetTool } = useToolWorkflow();
  const { hasUnsavedChanges } = useNavigationState();
  const { actions: navigationActions } = useNavigationActions();
  const { getToolNavigation } = useSidebarNavigation();
  const { config } = useAppConfig();
  const licenseAlert = useLicenseAlert();
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [activeButton, setActiveButton] = useState<string>('tools');
  const scrollableRef = useRef<HTMLDivElement>(null);
  const {
    tooltipOpen,
    manualCloseOnly,
    showCloseButton,
    toursMenuOpen,
    setToursMenuOpen,
    handleTooltipOpenChange,
  } = useToursTooltip();

  const isRTL = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

  // Open modal if URL is at /settings/*
  useEffect(() => {
    const isSettings = location.pathname.startsWith('/settings');
    setConfigModalOpen(isSettings);
  }, [location.pathname]);

  useEffect(() => {
    const next = getActiveNavButton(selectedToolKey, readerMode);
    setActiveButton(next);
  }, [leftPanelView, selectedToolKey, toolRegistry, readerMode]);

  const handleFilesButtonClick = () => {
    openFilesModal();
  };

  // Helper function to render navigation buttons with URL support
  const renderNavButton = (config: ButtonConfig, index: number, shouldGuardNavigation = false) => {
    const isActive = isNavButtonActive(config, activeButton, isFilesModalOpen, configModalOpen, selectedToolKey, leftPanelView);

    // Check if this button has URL navigation support
    const navProps = config.type === 'navigation' && (config.id === 'read' || config.id === 'automate')
      ? getToolNavigation(config.id)
      : null;

    const handleClick = (e?: React.MouseEvent) => {
      // If there are unsaved changes and this button should guard navigation, show warning modal
      if (shouldGuardNavigation && hasUnsavedChanges) {
        e?.preventDefault();
        navigationActions.requestNavigation(() => {
          config.onClick();
        });
        return;
      }
      if (navProps && e) {
        handleUnlessSpecialClick(e, config.onClick);
      } else {
        config.onClick();
      }
    };

    const buttonStyle = getNavButtonStyle(config, activeButton, isFilesModalOpen, configModalOpen, selectedToolKey, leftPanelView);

    // Render navigation button with conditional URL support
    return (
      <div
        key={config.id}
        style={{ marginTop: index === 0 ? '0.5rem' : "0rem" }}
      >
        <QuickAccessButton
          icon={config.icon}
          label={config.name}
          isActive={isActive}
          onClick={handleClick}
          href={navProps?.href}
          ariaLabel={config.name}
          backgroundColor={buttonStyle.backgroundColor}
          color={buttonStyle.color}
          component={navProps ? 'a' : 'button'}
          dataTestId={`${config.id}-button`}
          dataTour={`${config.id}-button`}
        />
      </div>
    );
  };

  const mainButtons: ButtonConfig[] = [
    {
      id: 'read',
      name: t("quickAccess.reader", "Reader"),
      icon: <LocalIcon icon="menu-book-rounded" width="1.25rem" height="1.25rem" />,
      size: 'md',
      isRound: false,
      type: 'navigation',
      onClick: () => {
        setActiveButton('read');
        handleReaderToggle();
      }
    },
    {
      id: 'automate',
      name: t("quickAccess.automate", "Automate"),
      icon: <LocalIcon icon="automation-outline" width="1.25rem" height="1.25rem" />,
      size: 'md',
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
      icon: <LocalIcon icon="folder-rounded" width="1.25rem" height="1.25rem" />,
      isRound: true,
      size: 'md',
      type: 'modal',
      onClick: handleFilesButtonClick
    },
  ];
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

  // Determine if settings button should be hidden
  // Hide when login is disabled AND showSettingsWhenNoLogin is false
  const shouldHideSettingsButton =
    config?.enableLogin === false &&
    config?.showSettingsWhenNoLogin === false;

  const bottomButtons: ButtonConfig[] = [
    {
      id: 'help',
      name: t("quickAccess.tours", "Tours"),
      icon: <LocalIcon icon="explore-rounded" width="1.25rem" height="1.25rem" />,
      isRound: true,
      size: 'md',
      type: 'action',
      onClick: () => {
        // This will be overridden by the wrapper logic
      },
    },
    ...(shouldHideSettingsButton ? [] : [{
      id: 'config',
      name: t("quickAccess.settings", "Settings"),
      icon: <LocalIcon icon="settings-rounded" width="1.25rem" height="1.25rem" />,
      size: 'md' as const,
      type: 'modal' as const,
      onClick: () => {
        navigate('/settings/overview');
        setConfigModalOpen(true);
      }
    } as ButtonConfig])
  ];

  return (
    <div
      ref={ref}
      data-sidebar="quick-access"
      data-tour="quick-access-bar"
      className={`h-screen flex flex-col w-16 quick-access-bar-main ${isRainbowMode ? 'rainbow-mode' : ''}`}
    >
      {/* Fixed header outside scrollable area */}
      <div className="quick-access-header">
        <ActiveToolButton activeButton={activeButton} setActiveButton={setActiveButton} />
        <AllToolsNavButton activeButton={activeButton} setActiveButton={setActiveButton} />

      </div>


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
          <Stack gap="lg" align="stretch">
            {mainButtons.map((config, index) => (
              <React.Fragment key={config.id}>
                {renderNavButton(config, index, config.id === 'read' || config.id === 'automate')}
              </React.Fragment>
            ))}
          </Stack>

          {/* Middle section */}
          {middleButtons.length > 0 && (
            <>
              <Divider
                size="xs"
                className="content-divider"
              />
              <Stack gap="lg" align="stretch">
                {middleButtons.map((config, index) => (
                  <React.Fragment key={config.id}>
                    {renderNavButton(config, index)}
                  </React.Fragment>
                ))}
              </Stack>
            </>
          )}

          {/* Spacer to push bottom buttons to bottom */}
          <div className="spacer" />

          {/* Bottom section */}
          <Stack gap="lg" align="stretch">
            {bottomButtons.map((buttonConfig, index) => {
              // Handle help button with menu or direct action
              if (buttonConfig.id === 'help') {
                const isAdmin = config?.isAdmin === true;
                const toursTooltipContent = isAdmin
                  ? t('quickAccess.toursTooltip.admin', 'Watch walkthroughs here: Tools tour, New V2 layout tour, and the Admin tour.')
                  : t('quickAccess.toursTooltip.user', 'Watch walkthroughs here: Tools tour and the New V2 layout tour.');
                const tourItems = [
                  {
                    key: 'whatsnew',
                    icon: <LocalIcon icon="auto-awesome-rounded" width="1.25rem" height="1.25rem" />,
                    title: t("quickAccess.helpMenu.whatsNewTour", "See what's new in V2"),
                    description: t("quickAccess.helpMenu.whatsNewTourDesc", "Tour the updated layout"),
                    onClick: () => requestStartTour('whatsnew'),
                  },
                  {
                    key: 'tools',
                    icon: <LocalIcon icon="view-carousel-rounded" width="1.25rem" height="1.25rem" />,
                    title: t("quickAccess.helpMenu.toolsTour", "Tools Tour"),
                    description: t("quickAccess.helpMenu.toolsTourDesc", "Learn what the tools can do"),
                    onClick: () => requestStartTour('tools'),
                  },
                  ...(isAdmin ? [{
                    key: 'admin',
                    icon: <LocalIcon icon="admin-panel-settings-rounded" width="1.25rem" height="1.25rem" />,
                    title: t("quickAccess.helpMenu.adminTour", "Admin Tour"),
                    description: t("quickAccess.helpMenu.adminTourDesc", "Explore admin settings & features"),
                    onClick: () => requestStartTour('admin'),
                  }] : []),
                ];

                const helpButtonNode = (
                  <div data-tour="help-button">
                    <Menu
                      position={isRTL ? 'left' : 'right'}
                      offset={10}
                      zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}
                      opened={toursMenuOpen}
                      onChange={setToursMenuOpen}
                    >
                      <Menu.Target>
                        <div>{renderNavButton(buttonConfig, index)}</div>
                      </Menu.Target>
                      <Menu.Dropdown>
                        {tourItems.map((item) => (
                          <Menu.Item
                            key={item.key}
                            leftSection={item.icon}
                            onClick={item.onClick}
                          >
                            <div>
                              <div style={{ fontWeight: 500 }}>
                                {item.title}
                              </div>
                              <div style={{ fontSize: '0.875rem', opacity: 0.7 }}>
                                {item.description}
                              </div>
                            </div>
                          </Menu.Item>
                        ))}
                      </Menu.Dropdown>
                    </Menu>
                  </div>
                );

                return (
                  <React.Fragment key={buttonConfig.id}>
                    <Tooltip
                      position="right"
                      arrow
                      offset={8}
                      open={tooltipOpen}
                      manualCloseOnly={manualCloseOnly}
                      showCloseButton={showCloseButton}
                      closeOnOutside={false}
                      openOnFocus={false}
                      content={toursTooltipContent}
                      onOpenChange={handleTooltipOpenChange}
                    >
                      {helpButtonNode}
                    </Tooltip>
                  </React.Fragment>
                );
              }

              const buttonNode = renderNavButton(buttonConfig, index);
              const shouldShowSettingsBadge =
                buttonConfig.id === 'config' &&
                licenseAlert.active &&
                licenseAlert.audience === 'admin';

              return (
                <React.Fragment key={buttonConfig.id}>
                  {shouldShowSettingsBadge ? (
                    <Indicator
                      inline
                      size={12}
                      color="orange"
                      position="top-end"
                      offset={4}
                    >
                      {buttonNode}
                    </Indicator>
                  ) : (
                    buttonNode
                  )}
                </React.Fragment>
              );
            })}
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
