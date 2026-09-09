import { useMediaQuery } from "@mantine/hooks";
import { Tooltip } from "@mantine/core";
import { ActionIcon, NavItem, NavSurface } from "@app/ui";
import { SidebarToggleButton } from "@app/components/shared/SidebarToggleButton";
import { Logo } from "@app/ui/Logo";
import { NavFooter } from "@app/components/shared/navFooter/NavFooter";
import { useAccountIdentity } from "@app/hooks/useAccountIdentity";
import { useFreeCreditsSummary } from "@processor/hooks/useFreeCreditsSummary";
import { useOpenPlan } from "@processor/hooks/useOpenPlan";
import { useTranslation } from "react-i18next";
import { useView, type ViewId } from "@processor/contexts/ViewContext";
import { useUI } from "@processor/contexts/UIContext";
import { LinkAccountFooterItem } from "@processor/components/LinkAccountFooterItem";
import { useConnectGate } from "@processor/hooks/useConnectGate";
import { CloseIcon } from "@processor/components/icons";
import {
  GROUP_PROCESSOR,
  GROUP_PLATFORM,
  type NavEntry,
  type NavGroup,
} from "@processor/components/sidebarGroups";
import "@processor/components/Sidebar.css";

const NAV_SECTIONS: NavGroup[] = [
  { labelKey: "processor.nav.section.processor", entries: GROUP_PROCESSOR },
  { labelKey: "processor.nav.section.platform", entries: GROUP_PLATFORM },
];

/** Must match the shell breakpoint in AppShell.css / Sidebar.css. */
export const MOBILE_QUERY = "(max-width: 48rem)";

export function Sidebar() {
  const { activeView, setActiveView } = useView();
  const {
    mobileNavOpen,
    closeMobileNav,
    sidebarCollapsed,
    toggleSidebarCollapsed,
  } = useUI();
  const { t } = useTranslation();
  const isMobile = useMediaQuery(MOBILE_QUERY, false, {
    getInitialValueInEffect: false,
  });
  const { displayName, profilePictureUrl } = useAccountIdentity();
  const credits = useFreeCreditsSummary();
  const openPlan = useOpenPlan();
  const { gated, connect } = useConnectGate();

  // Collapse is a desktop-only affordance: on mobile the sidebar is an
  // off-canvas drawer, so the icon-rail state never applies there.
  const collapsed = sidebarCollapsed && !isMobile;

  // Procurement is no longer a nav tab — it lives on Home as the deal-status hero and expands into
  // a takeover modal (matching the marketing prototype).

  function renderGroup(entries: NavEntry[]) {
    return entries.map((entry) => {
      const label = t(`processor.nav.${entry.id}`);
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
            } else if (entry.requiresLink && gated) {
              // Ask here: navigating first strands them on a page with nothing on it.
              connect();
            } else {
              setActiveView(id as ViewId);
            }
          }}
        />
      );
      return collapsed ? (
        <Tooltip key={entry.id} label={label} position="right" withinPortal>
          <div className="processor-sidebar__navtip">{item}</div>
        </Tooltip>
      ) : (
        item
      );
    });
  }

  return (
    <aside
      className={
        mobileNavOpen
          ? "processor-sidebar processor-sidebar--open"
          : "processor-sidebar"
      }
      data-collapsed={collapsed || undefined}
      aria-label={t("processor.shell.sidebar.primaryNav")}
      // Off-canvas on mobile: remove from the tab order and accessibility tree.
      inert={isMobile && !mobileNavOpen}
    >
      <div className="processor-sidebar__header">
        {!collapsed && <Logo variant="textOnly" textHeight="1.3rem" />}

        <SidebarToggleButton
          collapsed={collapsed}
          onToggle={toggleSidebarCollapsed}
        />

        <ActionIcon
          variant="tertiary"
          className="processor-sidebar__close"
          aria-label={t("processor.shell.topbar.closeNav")}
          onClick={closeMobileNav}
        >
          <CloseIcon size={18} />
        </ActionIcon>
      </div>

      <nav className="processor-sidebar__nav">
        {NAV_SECTIONS.map((section) => (
          <NavSurface
            key={section.labelKey}
            as="section"
            className="processor-sidebar__section"
          >
            <h2 className="processor-sidebar__section-label">
              {t(section.labelKey)}
            </h2>
            <div className="processor-sidebar__group">
              {renderGroup(section.entries)}
            </div>
          </NavSurface>
        ))}
      </nav>

      <NavFooter
        className="processor-sidebar__footer"
        displayName={displayName}
        profilePictureUrl={profilePictureUrl}
        showAccount={false}
        credits={credits}
        onOpenPlan={openPlan ?? undefined}
        accountExtras={<LinkAccountFooterItem />}
        collapsed={collapsed}
      />
    </aside>
  );
}
