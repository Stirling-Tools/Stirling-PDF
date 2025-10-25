import React, { useMemo, useState, useEffect } from 'react';
import { Modal, Text, ActionIcon } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import LocalIcon from './LocalIcon';
import Overview from './config/configSections/Overview';
import { createConfigNavSections } from './config/configNavSections';
import { NavKey } from './config/types';
import { useAppConfig } from '../../hooks/useAppConfig';
import './AppConfigModal.css';
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from '../../styles/zIndex';

interface AppConfigModalProps {
  opened: boolean;
  onClose: () => void;
}

const AppConfigModal: React.FC<AppConfigModalProps> = ({ opened, onClose }) => {
  const [active, setActive] = useState<NavKey>('overview');
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const { config } = useAppConfig();

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { key?: NavKey } | undefined;
      if (detail?.key) {
        setActive(detail.key);
      }
    };
    window.addEventListener('appConfig:navigate', handler as EventListener);
    return () => window.removeEventListener('appConfig:navigate', handler as EventListener);
  }, []);

  const colors = useMemo(() => ({
    navBg: 'var(--modal-nav-bg)',
    sectionTitle: 'var(--modal-nav-section-title)',
    navItem: 'var(--modal-nav-item)',
    navItemActive: 'var(--modal-nav-item-active)',
    navItemActiveBg: 'var(--modal-nav-item-active-bg)',
    contentBg: 'var(--modal-content-bg)',
    headerBorder: 'var(--modal-header-border)',
  }), []);

  // Placeholder logout handler (not needed in open-source but keeps SaaS compatibility)
  const handleLogout = () => {
    // In SaaS this would sign out, in open-source it does nothing
    console.log('Logout placeholder for SaaS compatibility');
  };

  // Get isAdmin from app config (based on JWT role)
  const isAdmin = config?.isAdmin ?? false;

  // Left navigation structure and icons
  const configNavSections = useMemo(() =>
    createConfigNavSections(
      Overview,
      handleLogout,
      isAdmin
    ),
    [isAdmin]
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

  return (
    <Modal
      opened={opened}
      onClose={onClose}
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
                    const color = isActive ? colors.navItemActive : colors.navItem;
                    const iconSize = isMobile ? 28 : 18;
                    return (
                      <div
                        key={item.key}
                        onClick={() => setActive(item.key)}
                        className={`modal-nav-item ${isMobile ? 'mobile' : ''}`}
                        style={{
                          background: isActive ? colors.navItemActiveBg : 'transparent',
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
              <ActionIcon variant="subtle" onClick={onClose} aria-label="Close">
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
