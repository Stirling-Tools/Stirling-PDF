import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { ActionIcon } from "@app/ui";
import { Sidebar } from "@portal/components/Sidebar";
import { useTheme } from "@portal/contexts/ThemeContext";
import { useUI } from "@portal/contexts/UIContext";
import { MenuIcon, SearchIcon } from "@portal/components/icons";
import wordmarkLight from "@app/assets/brand/modern-logo/StirlingProcessorLogoBlackText.svg";
import wordmarkDark from "@app/assets/brand/modern-logo/StirlingProcessorLogoWhiteText.svg";
import "@portal/components/AppShell.css";

/**
 * Compact header shown only under the mobile breakpoint (CSS-hidden on
 * desktop): hamburger opens the sidebar drawer, search opens the palette
 * (there's no ⌘K on a phone).
 */
function MobileTopbar() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { mobileNavOpen, toggleMobileNav, openSearch } = useUI();
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
      <img
        className="portal-shell__topbar-wordmark"
        src={theme === "dark" ? wordmarkDark : wordmarkLight}
        alt={t("portal.shell.sidebar.brandSuffix")}
      />
      <ActionIcon
        variant="tertiary"
        size="lg"
        aria-label={t("portal.shell.topbar.search")}
        onClick={openSearch}
      >
        <SearchIcon size={19} />
      </ActionIcon>
    </header>
  );
}

/**
 * Two-column layout: fixed-width sidebar on the left, a scrolling main column on
 * the right. Under the mobile breakpoint the sidebar becomes an off-canvas
 * drawer behind a scrim, opened from the topbar hamburger. The Sidebar reads
 * its state from context, so this shell stays prop-free.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { mobileNavOpen, closeMobileNav } = useUI();
  const { pathname } = useLocation();

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
      <Sidebar />
      {mobileNavOpen && (
        <div
          className="portal-shell__scrim"
          onClick={closeMobileNav}
          aria-hidden
        />
      )}
      <div className="portal-shell__main">
        <MobileTopbar />
        <main className="portal-shell__view">{children}</main>
      </div>
    </div>
  );
}
