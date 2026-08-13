import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { ActionIcon } from "@app/ui";
import { Sidebar } from "@processor/components/Sidebar";
import { ProcessorSearchBar } from "@processor/components/ProcessorSearchBar";
import { useUI } from "@processor/contexts/UIContext";
import { MenuIcon, SearchIcon } from "@processor/components/icons";
import { Logo } from "@app/ui/Logo";
import "@processor/components/AppShell.css";

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
    <div className="processor-shell">
      <Sidebar />
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
        <main className="processor-shell__view">{children}</main>
      </div>
    </div>
  );
}
