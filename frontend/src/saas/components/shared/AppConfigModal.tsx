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
import { withBasePath } from "@app/constants/app";
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

  const { signOut, user, creditBalance, refreshCredits } = useAuth();
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

  // When the modal opens to Plan, proactively refresh credits and log values
  useEffect(() => {
    if (!opened) return;
    if (active !== "plan") return;
    console.log(
      "[AppConfigModal] Opening Plan section. Current creditBalance:",
      creditBalance,
    );
    (async () => {
      try {
        await refreshCredits();
      } catch (e) {
        console.warn(
          "[AppConfigModal] Failed to refresh credits on Plan open:",
          e,
        );
      }
    })();
  }, [opened, active]);

  useEffect(() => {
    if (!opened) return;
    if (active !== "plan") return;
    console.log(
      "[AppConfigModal] Credit balance updated while viewing Plan:",
      creditBalance,
    );
  }, [opened, active, creditBalance]);

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

  // Left navigation structure and icons
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
