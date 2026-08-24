import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { ActionIcon } from "@app/ui";
import { Sidebar } from "@portal/components/Sidebar";
import { PortalSearchBar } from "@portal/components/PortalSearchBar";
import { useUI } from "@portal/contexts/UIContext";
import { useGoToEditor } from "@portal/hooks/useGoToEditor";
import { useSigningBadgeCount } from "@app/hooks/signing/useSigningBadgeCount";
import { MenuIcon, SearchIcon } from "@portal/components/icons";
import { Logo } from "@app/ui/Logo";
import { BrandMark } from "@app/components/shared/BrandMark";
import { BrandTile } from "@app/components/shared/BrandTile";
import "@app/components/layout/WorkspaceFrame.css";
import {
  QuickNavRailContainer,
  type QuickNavEntry,
} from "@app/components/shared/quickNav/QuickNavRailContainer";
import LocalIcon from "@app/components/shared/LocalIcon";
import "@portal/components/AppShell.css";

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
  const { t } = useTranslation();
  const {
    mobileNavOpen,
    closeMobileNav,
    openSettings,
  } = useUI();
  const { pathname } = useLocation();
  const goToEditor = useGoToEditor();
  // Same count the editor's rail shows: the hooks behind it read app config and
  // the REST API, both of which this shell already has.
  const signingCount = useSigningBadgeCount();

  // Deliberately the same bar the editor renders: same groups, same order, same
  // account control. Everything except Processor hands off to the editor app,
  // since that is where those destinations and tools live.
  const apps: QuickNavEntry[] = [
    {
      id: "editor",
      label: t("quickNav.editor", "Editor"),
      // The Stirling app tile - see the editor's own variant.
      icon: <BrandTile size="1.125rem" />,
      kind: "destination",
      onClick: () => goToEditor(),
    },
    {
      id: "processor",
      label: t("quickNav.processor", "Processor"),
      // The Stirling mark, not a feature glyph - see the editor's variant.
      icon: <BrandMark height="1.125rem" />,
      kind: "destination",
      // Current app, not current page: the entry for wherever you are inside the
      // processor is what claims the page.
      isActive: true,
      currentKind: "app",
      onClick: () => {},
    },
  ];

  // Editor destinations and tools, so they deep-link into the editor at that
  // route rather than pretending to run anything here.
  const within: QuickNavEntry[] = [
    {
      id: "files",
      label: t("fileSidebar.myFiles", "My Files"),
      icon: (
        <LocalIcon
          icon="folder-outline-rounded"
          width="1.125rem"
          height="1.125rem"
        />
      ),
      kind: "destination",
      onClick: () => goToEditor("/files"),
    },
    {
      id: "reader",
      label: t("quickNav.reader", "Reader"),
      icon: (
        <LocalIcon
          icon="menu-book-outline-rounded"
          width="1.125rem"
          height="1.125rem"
        />
      ),
      kind: "destination",
      // The editor reaches the reader by selecting the read tool; /read is that
      // tool's route, so this lands on the same place rather than the editor's
      // default view.
      onClick: () => goToEditor("/read"),
    },
    {
      id: "automate",
      label: t("quickAccess.automate", "Automate"),
      icon: (
        <LocalIcon
          icon="rebase-outline-rounded"
          width="1.125rem"
          height="1.125rem"
        />
      ),
      kind: "action",
      onClick: () => goToEditor("/automate"),
    },
    {
      id: "sharedSign",
      label: t("home.sharedSign.title", "Shared Signing"),
      icon: (
        <LocalIcon
          icon="draw-outline-rounded"
          width="1.125rem"
          height="1.125rem"
        />
      ),
      kind: "action",
      badge: signingCount,
      onClick: () => goToEditor("/shared-sign"),
    },
  ];

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
      <div className="workspace-frame">
        <QuickNavRailContainer
          groups={[apps, within]}
          onOpenSettings={() => openSettings()}
          onOpenTeams={() => openSettings("teams")}
        />
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
        <main className="portal-shell__view">{children}</main>
      </div>
    </div>
  );
}
