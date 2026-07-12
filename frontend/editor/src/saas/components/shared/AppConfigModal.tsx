import React, { useCallback, useMemo, useState, useEffect } from "react";
import { Modal, Text } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { useMediaQuery } from "@mantine/hooks";
import { useLocation } from "react-router-dom";
import { useAuth } from "@app/auth/UseSession";
import { isUserAnonymous } from "@app/auth/supabase";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
import Overview from "@app/components/shared/config/configSections/Overview";
import { createSaasConfigNavSections } from "@app/components/shared/config/saasConfigNavSections";
import { consumePendingSettingsNav } from "@app/utils/appSettings";
import {
  NavKey,
  type ConfigNavSection,
} from "@app/components/shared/config/types";
import { stripBasePath, withBasePath } from "@app/constants/app";
import { COOKIE_CONSENT_SCROLL_SHARD } from "@app/hooks/useCookieConsent";
import "@app/components/shared/AppConfigModal.css";
import {
  Z_INDEX_OVER_FULLSCREEN_SURFACE,
  Z_INDEX_OVER_SETTINGS_MODAL,
} from "@app/styles/zIndex";

interface AppConfigModalProps {
  opened: boolean;
  onClose: () => void;
  /** Accepted for interface parity with the core shell; this shell never
   *  URL-syncs, so it has no effect. */
  urlSync?: boolean;
  /** Section to land on when opening (used by non-URL hosts like the portal). */
  initialSection?: NavKey | null;
  /** Host-specific sections appended after the saas registry sections. */
  extraSections?: ConfigNavSection[];
}

const AppConfigModal: React.FC<AppConfigModalProps> = ({
  opened,
  onClose,
  initialSection,
  extraSections,
}) => {
  const isMobile = useMediaQuery("(max-width: 1024px)");

  const { signOut, user } = useAuth();
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [active, setActive] = useState<NavKey>("overview");
  const [notice, setNotice] = useState<string | null>(null);
  const location = useLocation();

  // The modal mounts lazily on first open, so a synchronous `appConfig:navigate`
  // dispatched by the opener can arrive before the listener below is attached.
  // Consume any section stashed by openAppSettings on mount to land on it.
  useEffect(() => {
    const pending = consumePendingSettingsNav();
    if (pending) setActive(pending);
  }, []);

  // Check if user can access billing features (non-anonymous users only)
  const isAnonymous = user ? isUserAnonymous(user) : false;
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { key?: NavKey } | undefined;
      if (detail?.key) {
        setActive(detail.key);
      }
    };
    window.addEventListener("appConfig:navigate", handler as EventListener);
    return () =>
      window.removeEventListener(
        "appConfig:navigate",
        handler as EventListener,
      );
  }, []);

  // When the modal opens via a /settings/<section> deep link (navigateToSettings — e.g. the
  // usage-limit modal CTAs, which need to land on the Plan section), select that section. The
  // opener (QuickAccessBar) opens the modal whenever the path is /settings/*, but doesn't carry
  // the section, and `active` defaults to "overview" — so without this a deep link would open on
  // Overview rather than the linked section. Non-URL hosts (the portal) pass the
  // section directly instead.
  useEffect(() => {
    if (!opened) return;
    if (initialSection) {
      setActive(initialSection);
      return;
    }
    const match = stripBasePath(location.pathname).match(
      /^\/settings\/([^/?#]+)/,
    );
    if (match) {
      setActive(match[1] as NavKey);
    }
  }, [opened, initialSection, location.pathname]);

  // Listen for notice updates (e.g., "Not enough credits..." next to Plan title)
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as
        | { key?: NavKey; notice?: string }
        | undefined;
      if (detail?.notice && (detail?.key ? detail.key === "plan" : true)) {
        setNotice(detail.notice);
      }
    };
    window.addEventListener("appConfig:notice", handler as EventListener);
    return () =>
      window.removeEventListener("appConfig:notice", handler as EventListener);
  }, []);

  // Full-screen overlays that live inside our React tree (e.g. the PAYG
  // UpgradeModal, portal'd to document.body) announce themselves here so we
  // can hide — not unmount — while they're up. Unmounting would kill the
  // overlay itself since it's our descendant; hiding keeps all section state
  // (active tab, scroll, wallet data) intact for when the overlay closes.
  const [overlayActive, setOverlayActive] = useState(false);
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as
        | { open?: boolean }
        | undefined;
      setOverlayActive(Boolean(detail?.open));
    };
    window.addEventListener("appConfig:overlay", handler as EventListener);
    return () =>
      window.removeEventListener("appConfig:overlay", handler as EventListener);
  }, []);

  const colors = useMemo(
    () => ({
      navBg: "var(--c-bg-raised)",
      sectionTitle: "var(--c-text-subtle)",
      navItem: "var(--modal-nav-item)",
      navItemActive: "var(--modal-nav-item-active)",
      navItemActiveBg: "var(--c-primary-subtle)",
      contentBg: "var(--c-surface)",
      headerBorder: "var(--c-border-subtle)",
    }),
    [],
  );
  const isDev = process.env.NODE_ENV === "development";

  const openLogoutConfirm = useCallback(() => setConfirmOpen(true), []);

  // Left navigation structure and icons. The Plan tab now internally branches
  // free vs subscribed × leader vs member via useWallet(), so the modal no
  // longer plumbs paygEnabled / isLeader through to the nav builder.
  const configNavSections = useMemo(() => {
    const sections = createSaasConfigNavSections(Overview, openLogoutConfirm, {
      isDev,
      isAnonymous,
      t,
    });
    return extraSections?.length ? [...sections, ...extraSections] : sections;
  }, [openLogoutConfirm, isDev, isAnonymous, t, extraSections]);

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

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        title={null}
        size={isMobile ? "100%" : 1200}
        centered
        radius="lg"
        withCloseButton={false}
        zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}
        overlayProps={{ opacity: 0.35, blur: 2 }}
        padding={0}
        fullScreen={isMobile}
        removeScrollProps={{ shards: [COOKIE_CONSENT_SCROLL_SHARD] }}
        // Hidden (not closed) while a child overlay like the PAYG UpgradeModal
        // is up — see the appConfig:overlay listener above. The focus trap and
        // escape/outside-close must release too: the trap would steal focus
        // from the Stripe card iframe, and Escape would close US underneath
        // the overlay — unmounting the checkout mid-payment.
        styles={{
          root: { display: overlayActive ? "none" : undefined },
        }}
        trapFocus={!overlayActive}
        closeOnEscape={!overlayActive}
        closeOnClickOutside={!overlayActive}
      >
        <div className="modal-container" data-tour="settings-modal">
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
                      const color = isActive
                        ? colors.navItemActive
                        : colors.navItem;
                      const iconSize = isMobile ? 28 : 18;
                      return (
                        <div
                          key={item.key}
                          data-tour={`admin-${item.key}-nav`}
                          onClick={() => setActive(item.key)}
                          className={`modal-nav-item ${isMobile ? "mobile" : ""}`}
                          style={{
                            background: isActive
                              ? colors.navItemActiveBg
                              : "transparent",
                          }}
                        >
                          <LocalIcon
                            icon={item.icon}
                            width={iconSize}
                            height={iconSize}
                            style={{ color }}
                          />
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
                <Text fw={700} size="lg">
                  {activeLabel}
                  {active === "plan" && notice ? (
                    <span
                      style={{
                        marginLeft: 8,
                        fontWeight: 600,
                        color: "var(--mantine-color-yellow-7)",
                      }}
                    >
                      – {notice}
                    </span>
                  ) : null}
                </Text>
                <ActionIcon
                  variant="tertiary"
                  onClick={onClose}
                  aria-label={t("common.close", "Close")}
                >
                  <LocalIcon icon="close-rounded" width={18} height={18} />
                </ActionIcon>
              </div>
              <div className="modal-body">{activeComponent}</div>
            </div>
          </div>
        </div>
      </Modal>
      {/* Confirm logout modal */}
      <Modal
        opened={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t("settings.signOut.title", "Sign out")}
        centered
        zIndex={Z_INDEX_OVER_SETTINGS_MODAL}
      >
        <div className="confirm-modal-content">
          <Text>
            {t(
              "settings.signOut.confirm",
              "Are you sure you want to sign out?",
            )}
          </Text>
          <div className="confirm-modal-buttons">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              accent="danger"
              onClick={async () => {
                try {
                  await signOut();
                } finally {
                  setConfirmOpen(false);
                  onClose();
                  window.location.href = withBasePath("/login");
                }
              }}
            >
              {t("settings.signOut.submit", "Sign out")}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default AppConfigModal;
