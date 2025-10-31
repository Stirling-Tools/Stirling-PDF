import React, { useMemo, useState, useEffect } from 'react';
import { Modal, Text, ActionIcon, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useNavigate, useLocation } from 'react-router-dom';
import LocalIcon from '@app/components/shared/LocalIcon';
import { createConfigNavSections } from '@app/components/shared/config/configNavSections';
import { NavKey } from '@app/components/shared/config/types';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import '@app/components/shared/AppConfigModal.css';
import { Z_INDEX_OVER_FULLSCREEN_SURFACE, Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';

interface AppConfigModalProps {
  opened: boolean;
  onClose: () => void;
}

const AppConfigModal: React.FC<AppConfigModalProps> = ({ opened, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [active, setActive] = useState<NavKey>('general');
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const { config } = useAppConfig();

  // Extract section from URL path (e.g., /settings/people -> people)
  const getSectionFromPath = (pathname: string): NavKey | null => {
    const match = pathname.match(/\/settings\/([^/]+)/);
    if (match && match[1]) {
      const validSections: NavKey[] = [
        'people', 'teams', 'general', 'hotkeys',
        'adminGeneral', 'adminSecurity', 'adminConnections', 'adminLegal',
        'adminPrivacy', 'adminDatabase', 'adminPremium', 'adminFeatures',
        'adminPlan', 'adminAudit', 'adminUsage', 'adminEndpoints', 'adminAdvanced'
      ];
      const section = match[1] as NavKey;
      return validSections.includes(section) ? section : null;
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

  console.log('[AppConfigModal] Config:', { isAdmin, runningEE, fullConfig: config });

  // Left navigation structure and icons
  const configNavSections = useMemo(() =>
    createConfigNavSections(
      isAdmin,
      runningEE
    ),
    [isAdmin, runningEE]
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

  const handleClose = () => {
    // Navigate back to home when closing modal
    navigate('/', { replace: true });
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={null}
      size={isMobile ? "100%" : 980}
      centered
      radius="lg"
      withCloseButton={false}
      zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}
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

                    const navItemContent = (
                      <div
                        key={item.key}
                        onClick={() => {
                          if (!isDisabled) {
                            setActive(item.key);
                            navigate(`/settings/${item.key}`);
                          }
                        }}
                        className={`modal-nav-item ${isMobile ? 'mobile' : ''}`}
                        style={{
                          background: isActive ? colors.navItemActiveBg : 'transparent',
                          opacity: isDisabled ? 0.5 : 1,
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <LocalIcon icon={item.icon} width={iconSize} height={iconSize} style={{ color }} />
                        {!isMobile && (
                          <Text size="sm" fw={500} style={{ color }}>
                            {item.label}
                          </Text>
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
        <div className="modal-content">
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

export default AppConfigModal;
