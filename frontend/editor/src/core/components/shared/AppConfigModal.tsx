import React, {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { Badge, Modal, Text, ActionIcon, Tooltip, Group } from "@mantine/core";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
import { useConfigNavSections } from "@app/components/shared/config/configNavSections";
import { NavKey, VALID_NAV_KEYS } from "@app/components/shared/config/types";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { COOKIE_CONSENT_SCROLL_SHARD } from "@app/hooks/useCookieConsent";
import "@app/components/shared/AppConfigModal.css";
import { useIsMobile } from "@app/hooks/useIsMobile";
import {
  Z_INDEX_CONFIG_MODAL,
  Z_INDEX_OVER_CONFIG_MODAL,
} from "@app/styles/zIndex";
import { useLicenseAlert } from "@app/hooks/useLicenseAlert";
import {
  UnsavedChangesProvider,
  useUnsavedChanges,
} from "@app/contexts/UnsavedChangesContext";
import { SettingsSearchBar } from "@app/components/shared/config/SettingsSearchBar";
import { stripBasePath, withBasePath } from "@app/constants/app";

interface AppConfigModalProps {
  opened: boolean;
  onClose: () => void;
}

// Extract section from URL path (e.g., /settings/people -> people)
const getSectionFromPath = (pathname: string): NavKey | null => {
  const match = pathname.match(/\/settings\/([^/]+)/);
  if (match && match[1]) {
    const section = match[1] as NavKey;
    return VALID_NAV_KEYS.includes(section as NavKey) ? section : null;
  }
  return null;
};

const AppConfigModalInner: React.FC<AppConfigModalProps> = ({
  opened,
  onClose,
}) => {
  const { t } = useTranslation();
  // Initialize from the URL so a deep link (`/settings/people`) lands on the
  // right tab without a one-frame "general" flicker.
  const [active, setActive] = useState<NavKey>(
    () => getSectionFromPath(window.location.pathname) ?? "general",
  );
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const { config } = useAppConfig();
  const licenseAlert = useLicenseAlert();
  const { confirmIfDirty } = useUnsavedChanges();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Sync active state with URL path. Runs on open, on external URL changes,
  // and on the redirect path below - NOT on intra-modal tab clicks, because
  // those update the URL via `history.replaceState` directly and never push
  // a new React Router location.
  useEffect(() => {
    const section = getSectionFromPath(location.pathname);
    if (opened && section) {
      setActive(section);
    } else if (
      opened &&
      location.pathname.startsWith("/settings") &&
      !section
    ) {
      // If at /settings without a section, redirect to general
      navigate("/settings/general", { replace: true });
    }
  }, [location.pathname, opened, navigate]);

  useEffect(() => {
    if (opened) {
      // Keep search closed initially by moving autofocus away from the searchable Select input.
      closeButtonRef.current?.focus();
    }
  }, [opened]);

  // Switch tab without forcing every `useLocation()` subscriber (HomePage and
  // its FileSidebar/Workbench/RightSidebar/FileManager tree) to re-render.
  //
  // First entry into /settings/* still goes through React Router so HomePage's
  // location-watching effect opens the modal and pushes a real history entry -
  // so the back button can close us. Subsequent tab clicks bypass React Router
  // and mutate the URL bar via `history.replaceState`. The browser sees the
  // URL update (deep-link / refresh still work) but React Router never fires a
  // location change, so the layer behind the Mantine overlay never repaints
  // and the backdrop-filter blur stops flashing.
  const switchSection = useCallback(
    (key: NavKey) => {
      setActive(key);
      const alreadyInSettings = stripBasePath(
        window.location.pathname,
      ).startsWith("/settings");
      if (alreadyInSettings) {
        window.history.replaceState(
          window.history.state,
          "",
          withBasePath(`/settings/${key}`),
        );
      } else {
        navigate(`/settings/${key}`);
      }
    },
    [navigate],
  );

  // Backwards-compat: external `appConfig:navigate` events route through the
  // same switchSection path so they get the no-flash treatment too.
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { key?: NavKey } | undefined;
      if (detail?.key) {
        switchSection(detail.key);
      }
    };
    window.addEventListener("appConfig:navigate", handler as EventListener);
    return () =>
      window.removeEventListener(
        "appConfig:navigate",
        handler as EventListener,
      );
  }, [switchSection]);

  const colors = useMemo(
    () => ({
      navBg: "var(--modal-nav-bg)",
      sectionTitle: "var(--modal-nav-section-title)",
      navItem: "var(--modal-nav-item)",
      navItemActive: "var(--modal-nav-item-active)",
      navItemActiveBg: "var(--modal-nav-item-active-bg)",
      contentBg: "var(--modal-content-bg)",
      headerBorder: "var(--modal-header-border)",
    }),
    [],
  );

  // Get isAdmin and runningEE from app config
  const isAdmin = config?.isAdmin ?? false;
  const runningEE = config?.runningEE ?? false;
  const loginEnabled = config?.enableLogin ?? false;

  const handleClose = useCallback(async () => {
    const canProceed = await confirmIfDirty();
    if (!canProceed) return;

    // Only unwind history if settings was opened via the URL; opened via state
    // there's no /settings entry to pop and navigate(-1) would jump to /files.
    if (location.pathname.startsWith("/settings")) {
      // "default" key = first entry (deep link/refresh); nothing to pop to.
      if (location.key === "default") {
        navigate("/", { replace: true });
      } else {
        navigate(-1);
      }
    }
    onClose();
  }, [confirmIfDirty, location.key, location.pathname, navigate, onClose]);

  // Synchronous wrapper for contexts (e.g. tour buttons) that need () => void
  const handleCloseSync = useCallback(() => {
    void handleClose();
  }, [handleClose]);

  // Left navigation structure and icons
  const configNavSections = useConfigNavSections(
    isAdmin,
    runningEE,
    loginEnabled,
    handleCloseSync,
  );

  const activeLabel = useMemo(() => {
    for (const section of configNavSections) {
      const found = section.items.find((i) => i.key === active);
      if (found) return found.label;
    }
    return "";
  }, [configNavSections, active]);

  const activeComponent = useMemo(() => {
    for (const section of configNavSections) {
      const found = section.items.find((i) => i.key === active);
      if (found) return found.component;
    }
    return null;
  }, [configNavSections, active]);

  const handleNavigation = useCallback(
    async (key: NavKey) => {
      const canProceed = await confirmIfDirty();
      if (!canProceed) return;
      switchSection(key);
    },
    [confirmIfDirty, switchSection],
  );

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={null}
      size={isMobile ? "100%" : 1100}
      centered
      radius="lg"
      withCloseButton={false}
      zIndex={Z_INDEX_CONFIG_MODAL}
      overlayProps={{ opacity: 0.35, blur: 2 }}
      padding={0}
      fullScreen={isMobile}
      styles={{ content: { overflowY: "hidden", overscrollBehavior: "none" } }}
      removeScrollProps={{ shards: [COOKIE_CONSENT_SCROLL_SHARD] }}
    >
      <div className="modal-container">
        {/* Left navigation */}
        <div
          className={`modal-nav ${isMobile ? "mobile" : ""}`}
          style={{
            background: colors.navBg,
            borderRight: `1px solid ${colors.headerBorder}`,
          }}
        >
          <div className="modal-nav-scroll">
            {configNavSections.map((section) => (
              <div key={section.title} className="modal-nav-section">
                {!isMobile && (
                  <Text
                    size="xs"
                    fw={600}
                    c={colors.sectionTitle}
                    style={{ textTransform: "uppercase", letterSpacing: 0.4 }}
                  >
                    {section.title}
                  </Text>
                )}
                <div className="modal-nav-section-items">
                  {section.items.map((item) => {
                    const isActive = active === item.key;
                    const isDisabled = item.disabled ?? false;
                    const color = isActive
                      ? colors.navItemActive
                      : colors.navItem;
                    const iconSize = isMobile ? 28 : 18;
                    const showPlanWarning =
                      item.key === "adminPlan" &&
                      licenseAlert.active &&
                      licenseAlert.audience === "admin";

                    const navItemContent = (
                      <div
                        key={item.key}
                        onClick={() => {
                          if (!isDisabled) {
                            handleNavigation(item.key);
                          }
                        }}
                        className={`modal-nav-item ${isActive ? "active" : ""} ${isMobile ? "mobile" : ""}`}
                        style={{
                          background: isActive
                            ? colors.navItemActiveBg
                            : "transparent",
                          opacity: isDisabled ? 0.6 : 1,
                          cursor: isDisabled ? "not-allowed" : "pointer",
                        }}
                        data-tour={`admin-${item.key}-nav`}
                      >
                        <LocalIcon
                          icon={item.icon}
                          width={iconSize}
                          height={iconSize}
                          style={{ color }}
                        />
                        {!isMobile && (
                          <Group
                            gap={4}
                            align="center"
                            wrap="nowrap"
                            style={{ minWidth: 0, flex: 1 }}
                          >
                            <Text
                              size="sm"
                              fw={500}
                              truncate
                              style={{ color, minWidth: 0, flex: 1 }}
                              title={item.label}
                            >
                              {item.label}
                            </Text>
                            {item.badge && (
                              <Badge
                                size="xs"
                                variant="light"
                                color={item.badgeColor ?? "orange"}
                                className="modal-nav-item-badge"
                                style={{ flexShrink: 0 }}
                              >
                                {item.badge}
                              </Badge>
                            )}
                            {showPlanWarning && (
                              <LocalIcon
                                icon="warning-rounded"
                                width={14}
                                height={14}
                                style={{
                                  color: "var(--mantine-color-orange-7)",
                                }}
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
                      <React.Fragment key={item.key}>
                        {navItemContent}
                      </React.Fragment>
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
              <Text fw={700} size="lg">
                {activeLabel}
              </Text>
              <Group gap="xs" wrap="nowrap">
                <SettingsSearchBar
                  configNavSections={configNavSections}
                  onNavigate={handleNavigation}
                  isMobile={isMobile}
                />
                <ActionIcon
                  ref={closeButtonRef}
                  variant="subtle"
                  onClick={handleClose}
                  aria-label={t("settings.close", "Close")}
                  data-autofocus
                >
                  <LocalIcon icon="close-rounded" width={18} height={18} />
                </ActionIcon>
              </Group>
            </div>
            <div className="modal-body">{activeComponent}</div>
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
