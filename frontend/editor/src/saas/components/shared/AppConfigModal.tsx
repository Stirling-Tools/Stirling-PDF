import React, { useCallback, useMemo, useState, useEffect } from "react";
import { Modal, Button, Text, ActionIcon } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useAuth } from "@app/auth/UseSession";
import { isUserAnonymous } from "@app/auth/supabase";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
import Overview from "@app/components/shared/config/configSections/Overview";
import { createSaasConfigNavSections } from "@app/components/shared/config/saasConfigNavSections";
import { NavKey } from "@app/components/shared/config/types";
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
}

const AppConfigModal: React.FC<AppConfigModalProps> = ({ opened, onClose }) => {
  const isMobile = useMediaQuery("(max-width: 1024px)");

  const { signOut, user } = useAuth();
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [active, setActive] = useState<NavKey>("overview");
  const [notice, setNotice] = useState<string | null>(null);

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
  // Overview rather than the linked section.
  useEffect(() => {
    if (!opened) return;
    const match = stripBasePath(window.location.pathname).match(
      /^\/settings\/([^/?#]+)/,
    );
    if (match) {
      setActive(match[1] as NavKey);
    }
  }, [opened]);

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
  const isDev = process.env.NODE_ENV === "development";

  const openLogoutConfirm = useCallback(() => setConfirmOpen(true), []);

  // Left navigation structure and icons. The Plan tab now internally branches
  // free vs subscribed × leader vs member via useWallet(), so the modal no
  // longer plumbs paygEnabled / isLeader through to the nav builder.
  const configNavSections = useMemo(
    () =>
      createSaasConfigNavSections(Overview, openLogoutConfirm, {
        isDev,
        isAnonymous,
        t,
      }),
    [openLogoutConfirm, isDev, isAnonymous, t],
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
                      const color = isActive
                        ? colors.navItemActive
                        : colors.navItem;
                      const iconSize = isMobile ? 28 : 18;
                      return (
                        <div
                          key={item.key}
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
                  variant="subtle"
                  onClick={onClose}
                  aria-label="Close"
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
        title="Sign out"
        centered
        zIndex={Z_INDEX_OVER_SETTINGS_MODAL}
      >
        <div className="confirm-modal-content">
          <Text>Are you sure you want to sign out?</Text>
          <div className="confirm-modal-buttons">
            <Button variant="default" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              color="red"
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
              Sign out
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default AppConfigModal;
