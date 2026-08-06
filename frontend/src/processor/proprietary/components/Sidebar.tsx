import { useMediaQuery } from "@mantine/hooks";
import { Tooltip } from "@mantine/core";
import { ActionIcon, NavItem, NavSurface } from "@editor/ui";
import { BrandSwitcher } from "@editor/components/shared/BrandSwitcher";
import { SidebarToggleIcon } from "@editor/components/shared/SidebarToggleIcon";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useView, type ViewId } from "@processor/contexts/ViewContext";
import { useUI } from "@processor/contexts/UIContext";
import { LinkAccountFooterItem } from "@processor/components/LinkAccountFooterItem";
import { EDITOR_URL, EDITOR_IS_SAME_APP } from "@processor/auth/editorUrl";
import { CloseIcon, SettingsIcon } from "@processor/components/icons";
import {
  GROUP_PROCESSOR,
  GROUP_PLATFORM,
  type NavEntry,
  type NavGroup,
} from "@processor/components/sidebarGroups";
import "@processor/components/Sidebar.css";

const NAV_SECTIONS: NavGroup[] = [
  { labelKey: "portal.nav.section.processor", entries: GROUP_PROCESSOR },
  { labelKey: "portal.nav.section.platform", entries: GROUP_PLATFORM },
];

/** Must match the shell breakpoint in AppShell.css / Sidebar.css. */
const MOBILE_QUERY = "(max-width: 48rem)";

export function Sidebar() {
  const { activeView, setActiveView } = useView();
  const {
    openSettings,
    mobileNavOpen,
    closeMobileNav,
    sidebarCollapsed,
    toggleSidebarCollapsed,
  } = useUI();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useMediaQuery(MOBILE_QUERY, false, {
    getInitialValueInEffect: false,
  });

  // Collapse is a desktop-only affordance: on mobile the sidebar is an
  // off-canvas drawer, so the icon-rail state never applies there.
  const collapsed = sidebarCollapsed && !isMobile;

  // Editor and portal are one SPA when the editor serves this origin's root, so
  // the switch stays client-side; an absolute EDITOR_URL (dev cross-app setup)
  // needs a full page load.
  const goToEditor = () => {
    if (EDITOR_IS_SAME_APP) navigate("/");
    else window.location.href = EDITOR_URL;
  };

  // Procurement is no longer a nav tab — it lives on Home as the deal-status hero and expands into
  // a takeover modal (matching the marketing prototype).

  function renderGroup(entries: NavEntry[]) {
    return entries.map((entry) => {
      const label = t(`portal.nav.${entry.id}`);
      const item = (
        <NavItem
          key={entry.id}
          id={entry.id}
          label={label}
          icon={entry.icon}
          isActive={activeView === entry.id}
          onClick={(id) => {
            // Route changes also close the drawer (AppShell), but re-selecting the
            // active view or opening an external tab changes no route — close here.
            closeMobileNav();
            if (entry.externalUrl) {
              window.open(entry.externalUrl, "_blank", "noopener,noreferrer");
            } else {
              setActiveView(id as ViewId);
            }
          }}
        />
      );
      return collapsed ? (
        <Tooltip key={entry.id} label={label} position="right" withinPortal>
          <div className="portal-sidebar__navtip">{item}</div>
        </Tooltip>
      ) : (
        item
      );
    });
  }

  return (
    <aside
      className={
        mobileNavOpen ? "portal-sidebar portal-sidebar--open" : "portal-sidebar"
      }
      data-collapsed={collapsed || undefined}
      aria-label={t("portal.shell.sidebar.primaryNav")}
      // Off-canvas on mobile: remove from the tab order and accessibility tree.
      inert={isMobile && !mobileNavOpen}
    >
      <div className="portal-sidebar__logo">
        <BrandSwitcher
          current="processor"
          onSwitch={goToEditor}
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

        <ActionIcon
          variant="tertiary"
          className="portal-sidebar__close"
          aria-label={t("portal.shell.topbar.closeNav")}
          onClick={closeMobileNav}
        >
          <CloseIcon size={18} />
        </ActionIcon>
      </div>

      <nav className="portal-sidebar__nav">
        {NAV_SECTIONS.map((section) => (
          <NavSurface
            key={section.labelKey}
            as="section"
            className="portal-sidebar__section"
          >
            <h2 className="portal-sidebar__section-label">
              {t(section.labelKey)}
            </h2>
            <div className="portal-sidebar__group">
              {renderGroup(section.entries)}
            </div>
          </NavSurface>
        ))}
      </nav>

      <NavSurface className="portal-sidebar__footer">
        <LinkAccountFooterItem />
        <NavItem
          id="settings"
          label={t("portal.nav.settings")}
          icon={<SettingsIcon />}
          onClick={() => openSettings()}
        />
      </NavSurface>
    </aside>
  );
}
