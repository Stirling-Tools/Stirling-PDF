import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { ActionIcon } from "@app/ui";
import { Sidebar } from "@portal/components/Sidebar";
import { PortalSearchBar } from "@portal/components/PortalSearchBar";
import { useUI } from "@portal/contexts/UIContext";
import { MenuIcon, SearchIcon } from "@portal/components/icons";
import { Logo } from "@app/ui/Logo";
import "@app/components/layout/WorkspaceFrame.css";
import { QuickNavHostBridge } from "@app/components/shared/quickNav/QuickNavHostBridge";
import "@portal/components/AppShell.css";
import { NotificationBell } from "@app/components/notifications/NotificationBell";
import { useIsPhone } from "@app/hooks/useIsMobile";

/**
 * Compact header shown only under the mobile breakpoint (CSS-hidden on
 * desktop): hamburger opens the sidebar drawer, search focuses the global
 * search bar below (there's no ⌘K on a phone).
 */
function MobileTopbar() {
  const { t } = useTranslation();
  const { mobileNavOpen, toggleMobileNav, closeMobileNav } = useUI();
  return (
    <header className="portal-shell__topbar">
      <ActionIcon
        variant="tertiary"
        size="lg"
        aria-label={t("portal.shell.topbar.openNav")}
        aria-expanded={mobileNavOpen}
        onClick={toggleMobileNav}
      >
        <MenuIcon size={20} />
      </ActionIcon>
      <Logo
        variant="iconAndText"
        iconHeight="1.6rem"
        textHeight="1.3rem"
        className="portal-shell__topbar-wordmark"
      />
      <ActionIcon
        variant="tertiary"
        size="lg"
        aria-label={t("portal.shell.topbar.search")}
        onClick={() => {
          closeMobileNav();
          document.getElementById("portal-search-input")?.focus();
        }}
      >
        <SearchIcon size={19} />
      </ActionIcon>
    </header>
  );
}

/**
 * Two-column layout: fixed-width sidebar on the left, a scrolling main column on
 * the right (topped by the global search bar). Under the mobile breakpoint the
 * sidebar becomes an off-canvas drawer behind a scrim, opened from the topbar
 * hamburger. The Sidebar reads its state from context, so this shell stays
 * prop-free.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { mobileNavOpen, closeMobileNav, openSettings } = useUI();
  const { pathname } = useLocation();
  // Below the quick nav rail's breakpoint the rail - and the bell it carries - is gone.
  const isPhone = useIsPhone();

  // Navigating (tap on a nav row, back button, deep link) always dismisses the
  // drawer. Depends on pathname only: the close fn's identity changes with any
  // UI state, and re-running on that would instantly close a just-opened drawer.
  useEffect(() => {
    closeMobileNav();
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeMobileNav();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileNavOpen, closeMobileNav]);

  return (
    <div className="portal-shell">
      {/* The rail and the sidebar side by side, both reaching the top of the
          window - the same frame the editor uses. */}
      {/* The same bridge the editor mounts - being here is proof the processor
          is available, and settings is the one thing that opens differently. */}
      <QuickNavHostBridge
        portalAccess
        onOpenSettings={() => openSettings()}
        onOpenTeams={() => openSettings("teams")}
      />
      <div className="workspace-frame">
        <Sidebar />
      </div>
      {mobileNavOpen && (
        <div
          className="portal-shell__scrim"
          onClick={closeMobileNav}
          aria-hidden
        />
      )}
      <div className="portal-shell__main">
        <MobileTopbar />
        <PortalSearchBar />
        {/* Phone widths only: above them the quick nav rail carries the bell, and this
            corner would be a second one. */}
        {isPhone && (
          <div className="portal-shell__notifications">
            <NotificationBell />
          </div>
        )}
        <main className="portal-shell__view">{children}</main>
      </div>
    </div>
  );
}
