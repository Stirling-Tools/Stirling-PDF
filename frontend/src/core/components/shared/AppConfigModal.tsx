import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Modal, Text, ActionIcon, Tooltip, Group } from '@mantine/core';
import { useNavigate, useLocation } from 'react-router-dom';
import LocalIcon from '@app/components/shared/LocalIcon';
import { useConfigNavSections } from '@app/components/shared/config/configNavSections';
import { NavKey, VALID_NAV_KEYS } from '@app/components/shared/config/types';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import '@app/components/shared/AppConfigModal.css';
import { useIsMobile } from '@app/hooks/useIsMobile';
import { Z_INDEX_CONFIG_MODAL, Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';
import { useLicenseAlert } from '@app/hooks/useLicenseAlert';
import { UnsavedChangesProvider, useUnsavedChanges } from '@app/contexts/UnsavedChangesContext';

interface AppConfigModalProps {
  opened: boolean;
  onClose: () => void;
}

const AppConfigModalInner: React.FC<AppConfigModalProps> = ({ opened, onClose }) => {
  const [active, setActive] = useState<NavKey>('general');
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const { config } = useAppConfig();
  const licenseAlert = useLicenseAlert();
  const { confirmIfDirty } = useUnsavedChanges();

  // Extract section from URL path (e.g., /settings/people -> people)
  const getSectionFromPath = (pathname: string): NavKey | null => {
    const match = pathname.match(/\/settings\/([^/]+)/);
    if (match && match[1]) {
      const section = match[1] as NavKey;
      return VALID_NAV_KEYS.includes(section as NavKey) ? section : null;
    }
    return null;
  };

  // Sync active state with URL path
  useEffect(() => {
    const section = getSectionFromPath(location.pathname);
    if (opened && section) {
      setActive(section);
    } else if (opened && location.pathname.startsWith('/settings') && !section) {
      // If at /settings without a section, redirect to general
      navigate('/settings/general', { replace: true });
    }
  }, [location.pathname, opened, navigate]);

  // Handle custom events for backwards compatibility
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { key?: NavKey } | undefined;
      if (detail?.key) {
        navigate(`/settings/${detail.key}`);
      }
    };
    window.addEventListener('appConfig:navigate', handler as EventListener);
    return () => window.removeEventListener('appConfig:navigate', handler as EventListener);
  }, [navigate]);

  const colors = useMemo(() => ({
    navBg: 'var(--modal-nav-bg)',
    sectionTitle: 'var(--modal-nav-section-title)',
    navItem: 'var(--modal-nav-item)',
    navItemActive: 'var(--modal-nav-item-active)',
    navItemActiveBg: 'var(--modal-nav-item-active-bg)',
    contentBg: 'var(--modal-content-bg)',
    headerBorder: 'var(--modal-header-border)',
  }), []);

  // Get isAdmin and runningEE from app config
  const isAdmin = config?.isAdmin ?? false;
  const runningEE = config?.runningEE ?? false;
  const loginEnabled = config?.enableLogin ?? false;

  // Left navigation structure and icons
  const configNavSections = useConfigNavSections(
    isAdmin,
    runningEE,
    loginEnabled
  );

  const activeLabel = useMemo(() => {
    for (const section of configNavSections) {
      const found = section.items.find(i => i.key === active);
      if (found) return found.label;
    }
    return '';
  }, [configNavSections, active]);

  const activeComponent = useMemo(() => {
    for (const section of configNavSections) {
      const found = section.items.find(i => i.key === active);
      if (found) return found.component;
    }
    return null;
  }, [configNavSections, active]);

  const handleClose = useCallback(async () => {
    const canProceed = await confirmIfDirty();
    if (!canProceed) return;
    
    // Navigate back to home when closing modal
    navigate('/', { replace: true });
    onClose();
  }, [confirmIfDirty, navigate, onClose]);

  const handleNavigation = useCallback(async (key: NavKey) => {
    const canProceed = await confirmIfDirty();
    if (!canProceed) return;
    
    setActive(key);
    navigate(`/settings/${key}`);
  }, [confirmIfDirty, navigate]);

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={null}
      size={isMobile ? "100%" : 980}
      centered
      radius="lg"
      withCloseButton={false}
      zIndex={Z_INDEX_CONFIG_MODAL}
      overlayProps={{ opacity: 0.35, blur: 2 }}
      padding={0}
      fullScreen={isMobile}
    >
      <div className="modal-container">
        {/* Left navigation */}
        <div
          className={`modal-nav ${isMobile ? 'mobile' : ''}`}
          style={{
            background: colors.navBg,
            borderRight: `1px solid ${colors.headerBorder}`,
          }}
        >
          <div className="modal-nav-scroll">
            {configNavSections.map(section => (
              <div key={section.title} className="modal-nav-section">
                {!isMobile && (
                  <Text size="xs" fw={600} c={colors.sectionTitle} style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {section.title}
                  </Text>
                )}
                <div className="modal-nav-section-items">
                  {section.items.map(item => {
                    const isActive = active === item.key;
                    const isDisabled = item.disabled ?? false;
                    const color = isActive ? colors.navItemActive : colors.navItem;
                    const iconSize = isMobile ? 28 : 18;
                    const showPlanWarning =
                      item.key === 'adminPlan' &&
                      licenseAlert.active &&
                      licenseAlert.audience === 'admin';

                    const navItemContent = (
                      <div
                        key={item.key}
                        onClick={() => handleNavigation(item.key)}
                        className={`modal-nav-item ${isMobile ? 'mobile' : ''}`}
                        style={{
                          background: isActive ? colors.navItemActiveBg : 'transparent',
                          opacity: isDisabled ? 0.6 : 1,
                          cursor: 'pointer',
                        }}
                        data-tour={`admin-${item.key}-nav`}
                      >
                        <LocalIcon icon={item.icon} width={iconSize} height={iconSize} style={{ color }} />
                        {!isMobile && (
                          <Group gap={4} align="center" wrap="nowrap">
                            <Text size="sm" fw={500} style={{ color }}>
                              {item.label}
                            </Text>
                            {showPlanWarning && (
                              <LocalIcon
                                icon="warning-rounded"
                                width={14}
                                height={14}
                                style={{ color: 'var(--mantine-color-orange-7)' }}
                              />
                            )}
                          </Group>
                        )}
                      </div>
                    );

                    return isDisabled && item.disabledTooltip ? (
                      <Tooltip
                        key={item.key}
                        label={item.disabledTooltip}
                        position="right"
                        withArrow
                        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
                      >
                        {navItemContent}
                      </Tooltip>
                    ) : (
                      <React.Fragment key={item.key}>{navItemContent}</React.Fragment>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right content */}
        <div className="modal-content" data-tour="settings-content-area">
          <div className="modal-content-scroll">
            {/* Sticky header with section title and small close button */}
            <div
              className="modal-header"
              style={{
                background: colors.contentBg,
                borderBottom: `1px solid ${colors.headerBorder}`,
              }}
            >
              <Text fw={700} size="lg">{activeLabel}</Text>
              <ActionIcon variant="subtle" onClick={handleClose} aria-label="Close">
                <LocalIcon icon="close-rounded" width={18} height={18} />
              </ActionIcon>
            </div>
            <div className="modal-body">
              {activeComponent}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

// Wrapper component that provides the UnsavedChangesContext
const AppConfigModal: React.FC<AppConfigModalProps> = (props) => {
  return (
    <UnsavedChangesProvider>
      <AppConfigModalInner {...props} />
    </UnsavedChangesProvider>
  );
};

export default AppConfigModal;
