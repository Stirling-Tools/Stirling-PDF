import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { ActionIcon } from "@app/ui";
import { Sidebar } from "@processor/components/Sidebar";
import { ProcessorSearchBar } from "@processor/components/ProcessorSearchBar";
import { useUI } from "@processor/contexts/UIContext";
import { MenuIcon, SearchIcon } from "@processor/components/icons";
import { Logo } from "@app/ui/Logo";
import "@app/components/layout/WorkspaceFrame.css";
import { QuickNavHostBridge } from "@app/components/shared/quickNav/QuickNavHostBridge";
import "@processor/components/AppShell.css";
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
    <header className="processor-shell__topbar">
      <ActionIcon
        variant="tertiary"
        size="lg"
        aria-label={t("processor.shell.topbar.openNav")}
        aria-expanded={mobileNavOpen}
        onClick={toggleMobileNav}
      >
        <MenuIcon size={20} />
      </ActionIcon>
      <Logo
        variant="iconAndText"
        iconHeight="1.6rem"
        textHeight="1.3rem"
        className="processor-shell__topbar-wordmark"
      />
      <ActionIcon
        variant="tertiary"
        size="lg"
        aria-label={t("processor.shell.topbar.search")}
        onClick={() => {
          closeMobileNav();
          document.getElementById("processor-search-input")?.focus();
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
  // Below this width the rail, and the bell it carries, is gone.
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
    <div className="processor-shell">
      {/* processorAccess: being here is proof the processor is available. */}
      <QuickNavHostBridge
        processorAccess
        onOpenSettings={() => openSettings()}
      />
      <div className="workspace-frame">
        <Sidebar />
      </div>
      {mobileNavOpen && (
        <div
          className="processor-shell__scrim"
          onClick={closeMobileNav}
          aria-hidden
        />
      )}
      <div className="processor-shell__main">
        <MobileTopbar />
        <ProcessorSearchBar />
        {/* Phone only: above that the rail carries it, and this would be a second. */}
        {isPhone && (
          <div className="processor-shell__notifications">
            <NotificationBell />
          </div>
        )}
        <main className="processor-shell__view">{children}</main>
      </div>
    </div>
  );
}
