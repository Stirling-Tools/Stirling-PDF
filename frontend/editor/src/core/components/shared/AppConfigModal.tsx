import React, {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { Badge, Modal, Text, Tooltip, Group } from "@mantine/core";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { ActionIcon } from "@app/ui/ActionIcon";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
import { useConfigNavSections } from "@app/components/shared/config/configNavSections";
import {
  NavKey,
  VALID_NAV_KEYS,
  type ConfigNavSection,
} from "@app/components/shared/config/types";
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
import { stripBasePath, withBasePath } from "@app/constants/app";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";

interface AppConfigModalProps {
  opened: boolean;
  onClose: () => void;
  /**
   * Mirror the active section to /settings/<key> URLs (deep links, history
   * unwind on close). Hosts mounted away from the editor's /settings route —
   * the admin portal — turn this off and the modal keeps its section purely in
   * state.
   */
  urlSync?: boolean;
  /** Section to land on when opening. Only honoured when urlSync is off (URL
   *  deep links win otherwise). */
  initialSection?: NavKey | null;
  /** Row anchor to focus when opening on a non-URL host. */
  initialFocus?: string | null;
  /** Host-specific sections appended after the build's registry sections. */
  extraSections?: ConfigNavSection[];
  /** Registry section keys to drop, for hosts a section can't run in. */
  hiddenSectionKeys?: NavKey[];
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
  urlSync = true,
  initialSection,
  initialFocus,
  extraSections,
  hiddenSectionKeys,
}) => {
  const { t } = useTranslation();
  // Initialize from the URL so a deep link (`/settings/people`) lands on the
  // right tab without a one-frame "general" flicker.
  const [active, setActive] = useState<NavKey>(
    () =>
      (urlSync ? getSectionFromPath(window.location.pathname) : null) ??
      initialSection ??
      "general",
  );
  const isMobile = useIsMobile();
  const [mobilePane, setMobilePane] = useState<"nav" | "content">("nav");
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
    if (!urlSync) return;
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
  }, [location.pathname, opened, navigate, urlSync]);

  // Non-URL hosts land the modal on the section they asked for.
  useEffect(() => {
    if (opened && !urlSync && initialSection) {
      setActive(initialSection);
    }
  }, [opened, urlSync, initialSection]);

  useEffect(() => {
    if (opened) {
      // Keep search closed initially by moving autofocus away from the searchable Select input.
      closeButtonRef.current?.focus();
    }
  }, [opened]);

  useEffect(() => {
    if (!opened) return;
    const target = urlSync
      ? getSectionFromPath(window.location.pathname)
      : initialSection;
    setMobilePane(target ? "content" : "nav");
  }, [opened, urlSync, initialSection]);

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
      if (!urlSync) return;
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
    [navigate, urlSync],
  );

  // Deep-link: /settings/{section}?focus={anchor} scrolls to and briefly
  // highlights the matching control (used by the global super search to jump
  // straight to an individual setting row).
  useEffect(() => {
    if (!opened) return;
    const focus = urlSync
      ? new URLSearchParams(location.search).get("focus")
      : initialFocus;
    if (!focus) return;
    let raf = 0;
    // Wait for the (possibly just-switched) section to render before scrolling.
    const timer = window.setTimeout(() => {
      raf = window.requestAnimationFrame(() => {
        const el = document.getElementById(focus);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("settings-focus-target");
        window.setTimeout(
          () => el.classList.remove("settings-focus-target"),
          1800,
        );
      });
    }, 150);
    return () => {
      window.clearTimeout(timer);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [opened, active, initialFocus, location.search, urlSync]);

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
      navBg: "var(--c-bg-raised)",
      sectionTitle: "var(--c-text-subtle)",
      navItem: "var(--modal-nav-item)",
      navItemActive: "var(--c-accent-fg)",
      navItemActiveBg: "var(--c-primary-subtle)",
      contentBg: "var(--c-surface)",
      headerBorder: "var(--c-border-subtle)",
    }),
    [],
  );

  // Get isAdmin and runningEE from app config
  const isAdmin = config?.isAdmin ?? false;
  const runningEE = config?.runningEE ?? false;
  const loginEnabled = config?.enableLogin ?? false;

  /** Resolves false when a dirty-state confirm kept the modal open. */
  const handleClose = useCallback(async () => {
    const canProceed = await confirmIfDirty();
    if (!canProceed) return false;

    // Only unwind history if settings was opened via the URL; opened via state
    // there's no /settings entry to pop and navigate(-1) would jump to /files.
    if (urlSync && location.pathname.startsWith("/settings")) {
      // "default" key = first entry (deep link/refresh); nothing to pop to.
      if (location.key === "default") {
        navigate(EDITOR_BASENAME, { replace: true });
      } else {
        navigate(-1);
      }
    }
    onClose();
    return true;
  }, [
    confirmIfDirty,
    location.key,
    location.pathname,
    navigate,
    onClose,
    urlSync,
  ]);

  // Synchronous wrapper for contexts (e.g. tour buttons) that need () => void
  const handleCloseSync = useCallback(() => {
    void handleClose();
  }, [handleClose]);

  // Cmd/Ctrl+K: hand over to the global super search. The bar's own shortcut
  // is inert while a dialog traps focus, so the modal closes itself (through
  // the same dirty-check as any other close) and asks the bar to take focus.
  // Settings results deep-link straight back into this modal.
  useEffect(() => {
    if (!opened) return;
    const onKey = (e: KeyboardEvent) => {
      const combo = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
      if (!combo || e.code !== "KeyK") return;
      e.preventDefault();
      void handleClose().then((closed) => {
        if (closed) window.dispatchEvent(new Event("superSearch:focus"));
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opened, handleClose]);

  // Left navigation structure and icons
  const registrySections = useConfigNavSections(
    isAdmin,
    runningEE,
    loginEnabled,
    handleCloseSync,
    config?.showSettingsWhenNoLogin ?? true,
  );
  const configNavSections = useMemo(() => {
    const base = hiddenSectionKeys?.length
      ? registrySections
          .map((s) => ({
            ...s,
            items: s.items.filter((i) => !hiddenSectionKeys.includes(i.key)),
          }))
          .filter((s) => s.items.length > 0)
      : registrySections;
    return extraSections?.length ? [...base, ...extraSections] : base;
  }, [registrySections, extraSections, hiddenSectionKeys]);

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
      setMobilePane("content");
    },
    [confirmIfDirty, switchSection],
  );

  const handleMobileBack = useCallback(async () => {
    const canProceed = await confirmIfDirty();
    if (!canProceed) return;
    setMobilePane("nav");
  }, [confirmIfDirty]);

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
      <div className="modal-container" data-tour="settings-modal">
        {/* Left navigation */}
        <div
          className={`modal-nav ${isMobile ? "mobile" : ""}`}
          style={{
            background: colors.navBg,
            ...(isMobile
              ? { display: mobilePane === "nav" ? undefined : "none" }
              : { borderRight: `1px solid ${colors.headerBorder}` }),
          }}
        >
          {isMobile && (
            <div
              className="modal-header modal-nav-header"
              style={{
                background: colors.navBg,
                borderBottom: `1px solid ${colors.headerBorder}`,
              }}
            >
              <Text fw={700} size="lg">
                {t("settings.title", "Settings")}
              </Text>
              <ActionIcon
                variant="tertiary"
                onClick={handleClose}
                aria-label={t("settings.close", "Close")}
              >
                <LocalIcon icon="close-rounded" width={18} height={18} />
              </ActionIcon>
            </div>
          )}
          <div className="modal-nav-scroll">
            {configNavSections.map((section) => (
              <div key={section.title} className="modal-nav-section">
                <Text
                  size="xs"
                  fw={600}
                  c={colors.sectionTitle}
                  style={{ textTransform: "uppercase", letterSpacing: 0.4 }}
                >
                  {section.title}
                </Text>
                <div className="modal-nav-section-items">
                  {section.items.map((item) => {
                    const isActive = active === item.key;
                    const isDisabled = item.disabled ?? false;
                    const color = isActive
                      ? colors.navItemActive
                      : colors.navItem;
                    const iconSize = 18;
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
                          style={{ color, flexShrink: 0 }}
                        />
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
                        {isMobile && (
                          <ChevronRightRoundedIcon
                            className="modal-nav-chevron"
                            sx={{ fontSize: "1.25rem" }}
                          />
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
        <div
          className="modal-content"
          data-tour="settings-content-area"
          style={
            isMobile && mobilePane !== "content"
              ? { display: "none" }
              : undefined
          }
        >
          <div className="modal-content-scroll">
            {/* Sticky header with section title and small close button */}
            <div
              className="modal-header"
              style={{
                background: colors.contentBg,
                borderBottom: `1px solid ${colors.headerBorder}`,
              }}
            >
              <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                {isMobile && (
                  <ActionIcon
                    variant="tertiary"
                    onClick={() => void handleMobileBack()}
                    aria-label={t("settings.backToSections", "All settings")}
                  >
                    <ArrowBackRoundedIcon sx={{ fontSize: "1.25rem" }} />
                  </ActionIcon>
                )}
                <Text fw={700} size="lg" truncate>
                  {activeLabel}
                </Text>
              </Group>
              <Group gap="xs" wrap="nowrap">
                <ActionIcon
                  ref={closeButtonRef}
                  variant="tertiary"
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
