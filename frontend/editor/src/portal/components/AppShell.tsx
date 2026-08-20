import { useEffect, type ReactNode } from "react";
import { useMediaQuery } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { ActionIcon } from "@app/ui";
import { Sidebar, MOBILE_QUERY } from "@portal/components/Sidebar";
import { PortalSearchBar } from "@portal/components/PortalSearchBar";
import { useUI } from "@portal/contexts/UIContext";
import { useGoToEditor } from "@portal/hooks/useGoToEditor";
import { MenuIcon, SearchIcon } from "@portal/components/icons";
import { Logo } from "@app/ui/Logo";
import { BrandSwitcher } from "@app/components/shared/BrandSwitcher";
import { BrandMark } from "@app/components/shared/BrandMark";
import { BrandTile } from "@app/components/shared/BrandTile";
import { SidebarToggleIcon } from "@app/components/shared/SidebarToggleIcon";
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
    sidebarCollapsed,
    toggleSidebarCollapsed,
  } = useUI();
  const isMobile = useMediaQuery(MOBILE_QUERY, false, {
    getInitialValueInEffect: false,
  });
  // Collapse is a desktop affordance; on mobile the sidebar is a drawer.
  const collapsed = sidebarCollapsed && !isMobile;
  const { pathname } = useLocation();
  const goToEditor = useGoToEditor();

  // Deliberately the same bar the editor renders: same groups, same order, same
  // account control. Everything except Processor hands off to the editor app,
  // since that is where those destinations and tools live.
  //
  // Reader is intentionally absent. Reader mode is a boolean, not a route, so
  // from here it could only call goToEditor() - the same thing Editor does, and
  // two icons for one destination is a decoy. It returns when reader is routable.
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
      isActive: true,
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
      // /files IS a route, so unlike reader mode this deep-links cleanly.
      onClick: () => goToEditor("/files"),
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
      // No badge here: the count comes from a hook that needs the editor's
      // signing context, which the portal doesn't mount.
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
      {/* Brand spans the top row so the logo sits in the true top-left corner,
          with the quick nav rail beginning beneath it rather than pushing it
          inward - the same frame the editor uses. */}
      <div className="workspace-frame">
        <div className="workspace-frame__brand portal-sidebar__logo">
          <BrandSwitcher
            current="processor"
            // Wrapped, not passed by reference: onSwitch hands over the target
            // app id, which goToEditor would take as a tool path.
            onSwitch={() => goToEditor()}
            collapsed={collapsed}
          />
          <ActionIcon
            variant="tertiary"
            className="portal-sidebar__collapse"
            aria-label={
              collapsed
                ? t("fileSidebar.expand", "Expand sidebar")
                : t("fileSidebar.collapse", "Collapse sidebar")
            }
            onClick={toggleSidebarCollapsed}
          >
            <SidebarToggleIcon size={18} />
          </ActionIcon>
        </div>
        <QuickNavRailContainer
          groups={[apps, within]}
          onOpenSettings={() => openSettings()}
        />
        <Sidebar brandHoisted />
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
