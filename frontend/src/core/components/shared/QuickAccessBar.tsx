import React, { useState, useRef, forwardRef, useEffect } from "react";
import { ActionIcon, Stack, Divider, Menu } from "@mantine/core";
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import LocalIcon from '@app/components/shared/LocalIcon';
import { useRainbowThemeContext } from "@app/components/shared/RainbowThemeProvider";
import { useIsOverflowing } from '@app/hooks/useIsOverflowing';
import { useFilesModalContext } from '@app/contexts/FilesModalContext';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useSidebarNavigation } from '@app/hooks/useSidebarNavigation';
import { handleUnlessSpecialClick } from '@app/utils/clickHandlers';
import { ButtonConfig } from '@app/types/sidebar';
import '@app/components/shared/quickAccessBar/QuickAccessBar.css';
import AllToolsNavButton from '@app/components/shared/AllToolsNavButton';
import ActiveToolButton from "@app/components/shared/quickAccessBar/ActiveToolButton";
import AppConfigModal from '@app/components/shared/AppConfigModal';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { useOnboarding } from '@app/contexts/OnboardingContext';

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
  const { getToolNavigation } = useSidebarNavigation();
  const { config } = useAppConfig();
  const { startTour } = useOnboarding();
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [activeButton, setActiveButton] = useState<string>('tools');
  const scrollableRef = useRef<HTMLDivElement>(null);
  const isOverflow = useIsOverflowing(scrollableRef);

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
          size={isActive ? 'lg' : 'md'}
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

  const middleButtons: ButtonConfig[] = [];
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

  const bottomButtons: ButtonConfig[] = [
    {
      id: 'help',
      name: t("quickAccess.help", "Help"),
      icon: <LocalIcon icon="help-rounded" width="1.25rem" height="1.25rem" />,
      isRound: true,
      size: 'md',
      type: 'action',
      onClick: () => {
        // This will be overridden by the wrapper logic
      },
    },
    {
      id: 'config',
      name: t("quickAccess.settings", "Settings"),
      icon: <LocalIcon icon="settings-rounded" width="1.25rem" height="1.25rem" />,
      size: 'md',
      type: 'modal',
      onClick: () => {
        navigate('/settings/overview');
        setConfigModalOpen(true);
      }
    }
  ];

  return (
    <div
      ref={ref}
      data-sidebar="quick-access"
      className={`h-screen flex flex-col w-16 quick-access-bar-main ${isRainbowMode ? 'rainbow-mode' : ''}`}
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

          {/* Divider after main buttons (creates gap) */}
          {middleButtons.length === 0 && (
            <Divider
              size="xs"
              className="content-divider"
            />
          )}

          {/* Middle section */}
          {middleButtons.length > 0 && (
            <>
              <Divider
                size="xs"
                className="content-divider"
              />
              <Stack gap="lg" align="center">
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
          <Stack gap="lg" align="center">
            {bottomButtons.map((buttonConfig, index) => {
              // Handle help button with menu or direct action
              if (buttonConfig.id === 'help') {
                const isAdmin = config?.isAdmin === true;

                // If not admin, just show button that starts tools tour directly
                if (!isAdmin) {
                  return (
                    <div
                      key={buttonConfig.id}
                      data-tour="help-button"
                      onClick={() => startTour('tools')}
                    >
                      {renderNavButton(buttonConfig, index)}
                    </div>
                  );
                }

                // If admin, show menu with both options
                return (
                  <div key={buttonConfig.id} data-tour="help-button">
                    <Menu position={isRTL ? 'left' : 'right'} offset={10} zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}>
                      <Menu.Target>
                        <div>{renderNavButton(buttonConfig, index)}</div>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<LocalIcon icon="view-carousel-rounded" width="1.25rem" height="1.25rem" />}
                          onClick={() => startTour('tools')}
                        >
                          <div>
                            <div style={{ fontWeight: 500 }}>
                              {t("quickAccess.helpMenu.toolsTour", "Tools Tour")}
                            </div>
                            <div style={{ fontSize: '0.875rem', opacity: 0.7 }}>
                              {t("quickAccess.helpMenu.toolsTourDesc", "Learn what the tools can do")}
                            </div>
                          </div>
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<LocalIcon icon="admin-panel-settings-rounded" width="1.25rem" height="1.25rem" />}
                          onClick={() => startTour('admin')}
                        >
                          <div>
                            <div style={{ fontWeight: 500 }}>
                              {t("quickAccess.helpMenu.adminTour", "Admin Tour")}
                            </div>
                            <div style={{ fontSize: '0.875rem', opacity: 0.7 }}>
                              {t("quickAccess.helpMenu.adminTourDesc", "Explore admin settings & features")}
                            </div>
                          </div>
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </div>
                );
              }

              return (
                <React.Fragment key={buttonConfig.id}>
                  {renderNavButton(buttonConfig, index)}
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
