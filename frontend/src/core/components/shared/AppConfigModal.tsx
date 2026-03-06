import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Modal, Text, ActionIcon, Tooltip, Group, Select } from '@mantine/core';
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
import { useTranslation } from 'react-i18next';

interface AppConfigModalProps {
  opened: boolean;
  onClose: () => void;
}

interface SettingsSearchOption {
  value: NavKey;
  label: string;
  sectionTitle: string;
  destinationPath: string;
  searchableContent: string[];
  matchedContext?: string;
}

const SETTINGS_SEARCH_TRANSLATION_PREFIXES: Partial<Record<string, string[]>> = {
  general: ['settings.general'],
  hotkeys: ['settings.hotkeys'],
  account: ['account'],
  people: ['settings.workspace'],
  teams: ['settings.workspace', 'settings.team'],
  'api-keys': ['settings.developer'],
  connectionMode: ['settings.connection'],
  planBilling: ['settings.planBilling'],
  adminGeneral: ['admin.settings.general'],
  adminFeatures: ['admin.settings.features'],
  adminEndpoints: ['admin.settings.endpoints'],
  adminDatabase: ['admin.settings.database'],
  adminAdvanced: ['admin.settings.advanced'],
  adminSecurity: ['admin.settings.security'],
  adminConnections: [
    'admin.settings.connections',
    'admin.settings.mail',
    'admin.settings.security',
    'admin.settings.telegram',
    'admin.settings.premium',
    'admin.settings.general',
    'settings.securityAuth',
    'settings.connection',
  ],
  adminPlan: ['settings.planBilling', 'admin.settings.premium', 'settings.licensingAnalytics'],
  adminAudit: ['settings.licensingAnalytics'],
  adminUsage: ['settings.licensingAnalytics'],
  adminLegal: ['admin.settings.legal'],
  adminPrivacy: ['admin.settings.privacy'],
};

const getTranslationPrefixesForNavKey = (key: string): string[] => {
  const explicitPrefixes = SETTINGS_SEARCH_TRANSLATION_PREFIXES[key] ?? [];

  const inferredPrefixes: string[] = [];

  if (key.startsWith('admin')) {
    const adminSuffix = key.replace(/^admin/, '');
    const normalizedAdminSuffix = adminSuffix.charAt(0).toLowerCase() + adminSuffix.slice(1);
    inferredPrefixes.push(`admin.settings.${normalizedAdminSuffix}`);
  } else {
    inferredPrefixes.push(`settings.${key}`);
  }

  return Array.from(new Set([...explicitPrefixes, ...inferredPrefixes]));
};

const flattenTranslationStrings = (value: unknown): string[] => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(flattenTranslationStrings);
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(flattenTranslationStrings);
  }

  return [];
};

const buildMatchSnippet = (text: string, query: string): string => {
  const normalizedText = text.toLocaleLowerCase();
  const normalizedQuery = query.toLocaleLowerCase();
  const matchIndex = normalizedText.indexOf(normalizedQuery);

  if (matchIndex === -1) {
    return text;
  }

  const maxLength = 84;
  const contextPadding = 28;
  const start = Math.max(0, matchIndex - contextPadding);
  const end = Math.min(text.length, matchIndex + query.length + contextPadding);
  const snippet = text.slice(start, end);

  if (snippet.length <= maxLength) {
    return `${start > 0 ? '…' : ''}${snippet}${end < text.length ? '…' : ''}`;
  }

  return `${start > 0 ? '…' : ''}${snippet.slice(0, maxLength)}${end < text.length ? '…' : ''}`;
};

const AppConfigModalInner: React.FC<AppConfigModalProps> = ({ opened, onClose }) => {
  const [active, setActive] = useState<NavKey>('general');
  const [searchValue, setSearchValue] = useState('');
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const licenseAlert = useLicenseAlert();
  const { confirmIfDirty } = useUnsavedChanges();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    if (opened) {
      setSearchValue('');
    }
  }, [opened]);

  useEffect(() => {
    if (opened) {
      // Keep search closed initially by moving autofocus away from the searchable Select input.
      closeButtonRef.current?.focus();
    }
  }, [opened]);

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

  // Build a global index from every accessible settings tab in the modal navigation.
  // This does not render section components, so API calls still happen only when a tab is opened.
  const searchableSections = useMemo<SettingsSearchOption[]>(() => {
    return configNavSections.flatMap((section) =>
      section.items
        .filter((item) => !item.disabled)
        .map((item) => {
          const translationPrefixes = getTranslationPrefixesForNavKey(item.key);
          const translationContent = translationPrefixes.flatMap((prefix) =>
            flattenTranslationStrings(t(prefix, { returnObjects: true, defaultValue: {} } as any))
          );

          const searchableContent = Array.from(
            new Set([
              item.label,
              section.title,
              `/settings/${item.key}`,
              ...translationContent,
            ])
          );

          return {
            value: item.key,
            label: item.label,
            sectionTitle: section.title,
            destinationPath: `/settings/${item.key}`,
            searchableContent,
          };
        })
    );
  }, [configNavSections, t]);

  const filteredSearchableSections = useMemo<SettingsSearchOption[]>(() => {
    const query = searchValue.trim();
    if (!query) {
      return searchableSections;
    }

    const normalizedQuery = query.toLocaleLowerCase();

    return searchableSections.reduce<SettingsSearchOption[]>((accumulator, option) => {
      const matchedEntry = option.searchableContent.find((entry) =>
        entry.toLocaleLowerCase().includes(normalizedQuery)
      );

      if (!matchedEntry) {
        return accumulator;
      }

      accumulator.push({
        ...option,
        matchedContext: buildMatchSnippet(matchedEntry, query),
      });

      return accumulator;
    }, []);
  }, [searchValue, searchableSections]);

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
    setSearchValue('');
    navigate(`/settings/${key}`);
  }, [confirmIfDirty, navigate]);

  const handleSearchNavigation = useCallback(async (value: string | null) => {
    if (!value) return;
    if (!VALID_NAV_KEYS.includes(value as NavKey)) return;
    await handleNavigation(value as NavKey);
  }, [handleNavigation]);

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
                        onClick={() => {
                          if (!isDisabled) {
                            handleNavigation(item.key);
                          }
                        }}
                        className={`modal-nav-item ${isMobile ? 'mobile' : ''}`}
                        style={{
                          background: isActive ? colors.navItemActiveBg : 'transparent',
                          opacity: isDisabled ? 0.6 : 1,
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
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
              <Group gap="xs" wrap="nowrap">
                <Select
                  className="settings-search-select"
                  data={filteredSearchableSections}
                  value={null}
                  searchValue={searchValue}
                  onSearchChange={setSearchValue}
                  onChange={handleSearchNavigation}
                  placeholder={t('settings.search.placeholder', 'Search settings pages...')}
                  leftSection={<LocalIcon icon="search-rounded" width={16} height={16} />}
                  aria-label={t('navbar.search', 'Search')}
                  nothingFoundMessage={t('search.noResults', 'No results found')}
                  searchable
                  clearable={false}
                  w={isMobile ? 170 : 320}
                  filter={({ options }) => options}
                  renderOption={({ option }) => {
                    const searchOption = option as unknown as SettingsSearchOption;
                    return (
                      <div className="settings-search-option">
                        <Text size="sm" fw={600}>{searchOption.label}</Text>
                        <Text size="xs" c="dimmed">
                          {searchOption.sectionTitle} · {searchOption.matchedContext || searchOption.destinationPath}
                        </Text>
                      </div>
                    );
                  }}
                  comboboxProps={{
                    withinPortal: true,
                    zIndex: Z_INDEX_OVER_CONFIG_MODAL,
                  }}
                />
                <ActionIcon
                  ref={closeButtonRef}
                  variant="subtle"
                  onClick={handleClose}
                  aria-label="Close"
                  data-autofocus
                >
                  <LocalIcon icon="close-rounded" width={18} height={18} />
                </ActionIcon>
              </Group>
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
