import React, { useState, useRef, forwardRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from 'react-dom';
import { Stack, Divider, Menu, Indicator } from "@mantine/core";
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import LocalIcon from '@app/components/shared/LocalIcon';
import { useRainbowThemeContext } from "@app/components/shared/RainbowThemeProvider";
import { useFilesModalContext } from '@app/contexts/FilesModalContext';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useFileSelection, useFileState } from '@app/contexts/file/fileHooks';
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
import ShareManagementModal from '@app/components/shared/ShareManagementModal';
import apiClient from '@app/services/apiClient';
import { absoluteWithBasePath } from '@app/constants/app';
import { alert } from '@app/components/toast';
import { uploadHistoryChain } from '@app/services/serverStorageUpload';
import { fileStorage } from '@app/services/fileStorage';
import { useFileActions } from '@app/contexts/FileContext';
import type { FileId } from '@app/types/file';
import type { StirlingFileStub } from '@app/types/fileContext';

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
  const { selectedFiles, selectedFileIds } = useFileSelection();
  const { state, selectors } = useFileState();
  const { actions } = useFileActions();
  const { hasUnsavedChanges } = useNavigationState();
  const { actions: navigationActions } = useNavigationActions();
  const { getToolNavigation } = useSidebarNavigation();
  const { config } = useAppConfig();
  const licenseAlert = useLicenseAlert();
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [activeButton, setActiveButton] = useState<string>('tools');
  const [accessMenuOpen, setAccessMenuOpen] = useState(false);
  const [accessInviteOpen, setAccessInviteOpen] = useState(false);
  const [selectedAccessFileId, setSelectedAccessFileId] = useState<string | null>(null);
  const [shareManageOpen, setShareManageOpen] = useState(false);
  const scrollableRef = useRef<HTMLDivElement>(null);
  const accessButtonRef = useRef<HTMLDivElement>(null);
  const accessPopoverRef = useRef<HTMLDivElement>(null);
  const [accessPopoverPosition, setAccessPopoverPosition] = useState({ top: 160, left: 84 });
  const sharingEnabled = config?.storageSharingEnabled === true;
  const shareLinksEnabled = config?.storageShareLinksEnabled === true;
  const [inviteRows, setInviteRows] = useState<Array<{ id: number; email: string; role: 'editor' | 'commenter' | 'viewer'; error?: string }>>([
    { id: Date.now(), email: '', role: 'editor' },
  ]);
  const [isInviting, setIsInviting] = useState(false);
  const {
    tooltipOpen,
    manualCloseOnly,
    showCloseButton,
    toursMenuOpen,
    setToursMenuOpen,
    handleTooltipOpenChange,
  } = useToursTooltip();

  const isRTL = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  const hasSelectedFiles = selectedFiles.length > 0;
  const selectedFileStubs = useMemo(
    () => selectedFileIds.map((id) => selectors.getStirlingFileStub(id)).filter(Boolean),
    [selectedFileIds, selectors, state.files.byId]
  );
  const selectedAccessFileStub =
    selectedFileStubs.find((file) => file.id === selectedAccessFileId) || selectedFileStubs[0];
  useEffect(() => {
    if (!hasSelectedFiles) {
      setAccessMenuOpen(false);
      setSelectedAccessFileId(null);
      setAccessInviteOpen(false);
      return;
    }
    if (!selectedAccessFileId || !selectedFiles.some((file) => file.fileId === selectedAccessFileId)) {
      setSelectedAccessFileId(selectedFiles[0]?.fileId ?? null);
    }
  }, [hasSelectedFiles, selectedAccessFileId, selectedFiles]);

  const resetInviteRows = useCallback(() => {
    setInviteRows([{ id: Date.now(), email: '', role: 'editor' }]);
  }, []);

  useEffect(() => {
    if (!accessMenuOpen) return;
    setAccessInviteOpen(false);
    setIsInviting(false);
    resetInviteRows();
    const updatePosition = () => {
      const anchor = accessButtonRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const left = isRTL ? Math.max(16, rect.left - 360) : rect.right + 12;
      const top = Math.max(24, rect.top - 24);
      setAccessPopoverPosition({ top, left });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [accessMenuOpen, isRTL, resetInviteRows]);

  useEffect(() => {
    if (!accessMenuOpen) return;
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (accessPopoverRef.current?.contains(target)) return;
      if (accessButtonRef.current?.contains(target)) return;
      setAccessMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccessMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [accessMenuOpen]);

  const shareBaseUrl = useMemo(() => {
    const frontendUrl = (config?.frontendUrl || '').trim();
    if (frontendUrl) {
      const normalized = frontendUrl.endsWith('/')
        ? frontendUrl.slice(0, -1)
        : frontendUrl;
      return `${normalized}/share/`;
    }
    return absoluteWithBasePath('/share/');
  }, [config?.frontendUrl]);

  const ensureStoredFile = useCallback(async (fileStub: StirlingFileStub): Promise<number> => {
    const localUpdatedAt = fileStub.createdAt ?? fileStub.lastModified ?? 0;
    const isUpToDate =
      Boolean(fileStub.remoteStorageId) &&
      Boolean(fileStub.remoteStorageUpdatedAt) &&
      (fileStub.remoteStorageUpdatedAt as number) >= localUpdatedAt;
    if (isUpToDate && fileStub.remoteStorageId) {
      return fileStub.remoteStorageId as number;
    }
    const originalFileId = (fileStub.originalFileId || fileStub.id) as FileId;
    const remoteId = fileStub.remoteStorageId as number | undefined;
    const { remoteId: storedId, updatedAt, chain } = await uploadHistoryChain(
      originalFileId,
      remoteId
    );
    for (const stub of chain) {
      actions.updateStirlingFileStub(stub.id, {
        remoteStorageId: storedId,
        remoteStorageUpdatedAt: updatedAt,
        remoteOwnedByCurrentUser: true,
        remoteSharedViaLink: false,
      });
      await fileStorage.updateFileMetadata(stub.id, {
        remoteStorageId: storedId,
        remoteStorageUpdatedAt: updatedAt,
        remoteOwnedByCurrentUser: true,
        remoteSharedViaLink: false,
      });
    }
    return storedId;
  }, [actions]);

  const openShareManage = useCallback(async () => {
    if (!sharingEnabled) {
      alert({
        alertType: 'warning',
        title: t('storageShare.sharingDisabled', 'Sharing is disabled.'),
        expandable: false,
        durationMs: 2500,
      });
      return;
    }
    if (selectedFileStubs.length > 1) {
      alert({
        alertType: 'warning',
        title: t('storageShare.selectSingleFile', 'Select a single file to manage sharing.'),
        expandable: false,
        durationMs: 2500,
      });
      return;
    }
    if (selectedAccessFileStub?.remoteOwnedByCurrentUser === false) {
      alert({
        alertType: 'warning',
        title: t('storageShare.ownerOnly', 'Only the owner can manage sharing.'),
        expandable: false,
        durationMs: 2500,
      });
      return;
    }
    try {
      if (selectedAccessFileStub) {
        await ensureStoredFile(selectedAccessFileStub);
      }
      setAccessMenuOpen(false);
      setShareManageOpen(true);
    } catch (error) {
      console.error('Failed to upload file for sharing:', error);
      alert({
        alertType: 'warning',
        title: t('storageUpload.failure', 'Upload failed. Please check your login and storage settings.'),
        expandable: false,
        durationMs: 3000,
      });
    }
  }, [ensureStoredFile, selectedAccessFileStub, selectedFileStubs.length, sharingEnabled, t]);

  const handleInviteRowChange = useCallback(
    (id: number, updates: Partial<{ email: string; role: 'editor' | 'commenter' | 'viewer'; error?: string }>) => {
      setInviteRows((prev) =>
        prev.map((row) => {
          if (row.id !== id) return row;
          const nextError = Object.prototype.hasOwnProperty.call(updates, 'error')
            ? updates.error
            : row.error;
          return { ...row, ...updates, error: nextError };
        })
      );
    },
    []
  );

  const handleAddInviteRow = useCallback(() => {
    setInviteRows((prev) => [...prev, { id: Date.now(), email: '', role: 'editor' }]);
  }, []);

  const handleRemoveInviteRow = useCallback((id: number) => {
    setInviteRows((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev));
  }, []);

  const handleSendInvites = useCallback(async () => {
    if (!selectedAccessFileStub) return;
    if (selectedAccessFileStub.remoteOwnedByCurrentUser === false) {
      alert({
        alertType: 'warning',
        title: t('storageShare.ownerOnly', 'Only the owner can manage sharing.'),
        expandable: false,
        durationMs: 2500,
      });
      return;
    }
    const nextRows = inviteRows.map((row) => {
      const trimmed = row.email.trim();
      let error: string | undefined;
      if (!trimmed) {
        error = t('storageShare.invalidUsername', 'Enter a valid username or email address.');
      }
      return { ...row, email: trimmed, error };
    });
    setInviteRows(nextRows);
    if (nextRows.some((row) => row.error)) {
      return;
    }
    setIsInviting(true);
    try {
      const storedId = await ensureStoredFile(selectedAccessFileStub);
      for (const row of nextRows) {
        await apiClient.post(`/api/v1/storage/files/${storedId}/shares/users`, {
          username: row.email.trim(),
          accessRole: row.role,
        });
      }
      alert({
        alertType: 'success',
        title: t('storageShare.userAdded', 'User added to shared list.'),
        expandable: false,
        durationMs: 2500,
      });
      setAccessInviteOpen(false);
      resetInviteRows();
    } catch (error) {
      console.error('Failed to send invite:', error);
      alert({
        alertType: 'warning',
        title: t('storageShare.userAddFailed', 'Unable to share with that user.'),
        expandable: false,
        durationMs: 3000,
      });
    } finally {
      setIsInviting(false);
    }
  }, [ensureStoredFile, inviteRows, resetInviteRows, selectedAccessFileStub, t]);

  const handleCopyShareLink = async () => {
    if (!shareLinksEnabled) {
      alert({
        alertType: 'warning',
        title: t('storageShare.linksDisabled', 'Share links are disabled.'),
        expandable: false,
        durationMs: 2500,
      });
      return;
    }
    if (selectedFileStubs.length > 1) {
      alert({
        alertType: 'warning',
        title: t('storageShare.selectSingleFile', 'Select a single file to copy a link.'),
        expandable: false,
        durationMs: 2500,
      });
      return;
    }
    if (selectedAccessFileStub?.remoteOwnedByCurrentUser === false) {
      alert({
        alertType: 'warning',
        title: t('storageShare.ownerOnly', 'Only the owner can manage sharing.'),
        expandable: false,
        durationMs: 2500,
      });
      return;
    }
    if (!selectedAccessFileStub?.remoteStorageId) {
      try {
        await ensureStoredFile(selectedAccessFileStub);
      } catch (error) {
        console.error('Failed to upload file for sharing:', error);
        alert({
          alertType: 'warning',
          title: t('storageUpload.failure', 'Upload failed. Please check your login and storage settings.'),
          expandable: false,
          durationMs: 3000,
        });
        return;
      }
    }
    try {
      const storedId = await ensureStoredFile(selectedAccessFileStub);
      const response = await apiClient.get<{ shareLinks?: Array<{ token?: string }> }>(
        `/api/v1/storage/files/${storedId}`,
        { suppressErrorToast: true } as any
      );
      const links = response.data?.shareLinks ?? [];
      let token = links[links.length - 1]?.token;
      if (!token) {
        const shareResponse = await apiClient.post(`/api/v1/storage/files/${storedId}/shares/links`, {
          accessRole: 'editor',
        });
        token = shareResponse.data?.token;
        if (token) {
          actions.updateStirlingFileStub(selectedAccessFileStub.id, { remoteHasShareLinks: true });
          await fileStorage.updateFileMetadata(selectedAccessFileStub.id, { remoteHasShareLinks: true });
        }
      }
      if (!token) {
        alert({
          alertType: 'warning',
          title: t('storageShare.failure', 'Unable to generate a share link. Please try again.'),
          expandable: false,
          durationMs: 2500,
        });
        return;
      }
      await navigator.clipboard.writeText(`${shareBaseUrl}${token}`);
      alert({
        alertType: 'success',
        title: t('storageShare.copied', 'Link copied to clipboard'),
        expandable: false,
        durationMs: 2000,
      });
    } catch (error) {
      console.error('Failed to copy share link:', error);
      alert({
        alertType: 'warning',
        title: t('storageShare.copyFailed', 'Copy failed'),
        expandable: false,
        durationMs: 2500,
      });
    }
  };

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
                {hasSelectedFiles && sharingEnabled && (
                  <div ref={accessButtonRef}>
                    <QuickAccessButton
                      icon={<LocalIcon icon="group-rounded" width="1.25rem" height="1.25rem" />}
                      label={t('quickAccess.access', 'Access')}
                      isActive={accessMenuOpen}
                      onClick={() => {
                        setAccessMenuOpen((prev) => !prev);
                      }}
                      ariaLabel={t('quickAccess.access', 'Access')}
                      dataTestId="access-button"
                    />
                  </div>
                )}
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

      {selectedAccessFileStub && (
        <ShareManagementModal
          opened={shareManageOpen}
          onClose={() => setShareManageOpen(false)}
          file={selectedAccessFileStub}
        />
      )}
      {hasSelectedFiles && typeof document !== 'undefined' && createPortal(
        <div
          ref={accessPopoverRef}
          className={`quick-access-popout ${accessMenuOpen ? 'is-open' : ''}`}
          style={{
            top: `${accessPopoverPosition.top}px`,
            left: `${accessPopoverPosition.left}px`,
            zIndex: Z_INDEX_OVER_FULLSCREEN_SURFACE,
          }}
          role="dialog"
          aria-label={t('quickAccess.accessPanel', 'Document access')}
        >
          <div className="quick-access-popout__card">
            <div className="quick-access-popout__header">
              <button
                type="button"
                className={`quick-access-popout__back ${accessInviteOpen ? 'is-visible' : ''}`}
                onClick={() => setAccessInviteOpen(false)}
                aria-label={t('quickAccess.accessBack', 'Back')}
              >
                <LocalIcon icon="arrow-back-rounded" width="1rem" height="1rem" />
              </button>
              <div className="quick-access-popout__title">
                {accessInviteOpen
                  ? t('quickAccess.accessInviteTitle', 'Invite People')
                  : t('quickAccess.accessTitle', 'Document Access')}
              </div>
              <div className="quick-access-popout__header-actions">
                {!accessInviteOpen && (
                  <button
                    type="button"
                    className="quick-access-popout__header-action"
                    onClick={() => {
                      void openShareManage();
                    }}
                    aria-label={t('storageShare.manage', 'Manage sharing')}
                  >
                    <LocalIcon icon="settings-rounded" width="1rem" height="1rem" />
                  </button>
                )}
                <button
                  type="button"
                  className="quick-access-popout__header-action"
                  onClick={() => setAccessMenuOpen(false)}
                  aria-label={t('close', 'Close')}
                >
                  <LocalIcon icon="close-rounded" width="1rem" height="1rem" />
                </button>
              </div>
            </div>

            <div className={`quick-access-popout__body ${accessInviteOpen ? 'is-invite' : ''}`}>
              <div className="quick-access-popout__panel">
                <div className="quick-access-popout__section">
                  <div className="quick-access-popout__label">
                    {t('quickAccess.accessFileLabel', 'File')}
                  </div>
                  <select
                    className="quick-access-popout__select"
                    value={selectedAccessFileStub?.id ?? ''}
                    onChange={(event) => setSelectedAccessFileId(event.target.value)}
                  >
                    {selectedFileStubs.map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="quick-access-popout__divider" />

                <div className="quick-access-popout__section">
                  <div className="quick-access-popout__label">
                    {t('quickAccess.accessGeneral', 'General Access')}
                  </div>
                  <div className="quick-access-popout__row">
                    <div className="quick-access-popout__icon-bubble">
                      <LocalIcon icon="lock-rounded" width="1rem" height="1rem" />
                    </div>
                    <div className="quick-access-popout__row-text">
                      <div className="quick-access-popout__row-title">
                        {t('quickAccess.accessRestricted', 'Restricted')}
                      </div>
                      <div className="quick-access-popout__row-subtitle">
                        {t('quickAccess.accessRestrictedHint', 'Only people with access can open')}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="quick-access-popout__divider" />

                <div className="quick-access-popout__section">
                  <div className="quick-access-popout__label">
                    {t('quickAccess.accessPeople', 'People with access')}
                  </div>
                  <div className="quick-access-popout__person">
                    <div className="quick-access-popout__avatar">
                      {(selectedAccessFileStub?.remoteOwnerUsername || 'You').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="quick-access-popout__person-text">
                      <div className="quick-access-popout__row-title">
                        {selectedAccessFileStub?.remoteOwnerUsername || t('quickAccess.accessYou', 'You')}
                      </div>
                      <div className="quick-access-popout__row-subtitle">
                        {selectedAccessFileStub?.name ?? t('quickAccess.accessSelectedFile', 'Selected file')}
                      </div>
                    </div>
                    <span className="quick-access-popout__pill">
                      {t('quickAccess.accessOwner', 'Owner')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="quick-access-popout__panel quick-access-popout__panel--invite">
                <div className="quick-access-popout__section">
                  <div className="quick-access-popout__label">
                    {t('quickAccess.accessInviteTitle', 'Invite People')}
                  </div>
                </div>
                {inviteRows.map((row) => (
                  <div key={row.id} className="quick-access-popout__invite-row">
                    <div className="quick-access-popout__input-group">
                      <label className="quick-access-popout__label">
                        {t('quickAccess.accessEmail', 'Email Address')}
                      </label>
                      <input
                        className={`quick-access-popout__input ${row.error ? 'has-error' : ''}`}
                        placeholder={t('quickAccess.accessEmailPlaceholder', 'name@company.com')}
                        value={row.email}
                        onChange={(event) =>
                          handleInviteRowChange(row.id, { email: event.target.value, error: undefined })
                        }
                      />
                      {row.error && (
                        <div className="quick-access-popout__input-error">{row.error}</div>
                      )}
                    </div>
                    <div className="quick-access-popout__input-group">
                      <label className="quick-access-popout__label">
                        {t('quickAccess.accessRole', 'Role')}
                      </label>
                      <select
                        className="quick-access-popout__select"
                        value={row.role}
                        onChange={(event) =>
                          handleInviteRowChange(row.id, {
                            role: event.target.value as 'editor' | 'commenter' | 'viewer',
                          })
                        }
                      >
                        <option value="editor">{t('quickAccess.accessRoleEditor', 'Editor')}</option>
                        <option value="commenter">{t('quickAccess.accessRoleCommenter', 'Commenter')}</option>
                        <option value="viewer">{t('quickAccess.accessRoleViewer', 'Viewer')}</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      className="quick-access-popout__remove"
                      onClick={() => handleRemoveInviteRow(row.id)}
                      disabled={inviteRows.length === 1}
                      aria-label={t('quickAccess.accessRemove', 'Remove')}
                    >
                      <LocalIcon icon="close-rounded" width="0.9rem" height="0.9rem" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="quick-access-popout__add"
                  onClick={handleAddInviteRow}
                >
                  <span className="quick-access-popout__add-icon">+</span>
                  {t('quickAccess.accessAddPerson', 'Add another person')}
                </button>
              </div>
            </div>

            <div className="quick-access-popout__footer">
              {accessInviteOpen ? (
                <>
                  <button
                    type="button"
                    className="quick-access-popout__primary"
                    onClick={() => void handleSendInvites()}
                    disabled={isInviting}
                  >
                    <LocalIcon icon="send-rounded" width="1rem" height="1rem" />
                    {t('quickAccess.accessSendInvite', 'Send Invite')}
                  </button>
                  {shareLinksEnabled && (
                    <button
                      type="button"
                      className="quick-access-popout__link"
                      onClick={handleCopyShareLink}
                    >
                      <LocalIcon icon="link-rounded" width="1rem" height="1rem" />
                      {t('quickAccess.accessCopyLink', 'Copy link')}
                    </button>
                  )}
                </>
              ) : (
                <>
                  {sharingEnabled && (
                    <button
                      type="button"
                      className="quick-access-popout__primary"
                      onClick={() => setAccessInviteOpen(true)}
                    >
                      <LocalIcon icon="person-add-rounded" width="1rem" height="1rem" />
                      {t('accessInvite', 'Invite')}
                    </button>
                  )}
                  {shareLinksEnabled && (
                    <button
                      type="button"
                      className="quick-access-popout__link"
                      onClick={handleCopyShareLink}
                    >
                      <LocalIcon icon="link-rounded" width="1rem" height="1rem" />
                      {t('quickAccess.accessCopyLink', 'Copy link')}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
});

QuickAccessBar.displayName = 'QuickAccessBar';

export default QuickAccessBar;
