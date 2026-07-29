import { useMediaQuery } from "@mantine/hooks";
import { ActionIcon, NavItem } from "@app/ui";
import { AppSwitch } from "@app/components/shared/AppSwitch";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useView, type ViewId } from "@portal/contexts/ViewContext";
import { useTheme } from "@portal/contexts/ThemeContext";
import { useUI } from "@portal/contexts/UIContext";
import { LinkAccountFooterItem } from "@portal/components/LinkAccountFooterItem";
import { EDITOR_URL, EDITOR_IS_SAME_APP } from "@portal/auth/editorUrl";
import mark from "@app/assets/brand/modern-logo/StirlingProcessorLogoNoText.svg";
import wordmarkLight from "@app/assets/brand/modern-logo/StirlingLogoBlackText.svg";
import wordmarkDark from "@app/assets/brand/modern-logo/StirlingLogoWhiteText.svg";
import { CloseIcon, SettingsIcon } from "@portal/components/icons";
import {
  GROUP_PROCESSOR,
  GROUP_PLATFORM,
  type NavEntry,
  type NavGroup,
} from "@portal/components/sidebarGroups";
import "@portal/components/Sidebar.css";

const NAV_SECTIONS: NavGroup[] = [
  { labelKey: "portal.nav.section.processor", entries: GROUP_PROCESSOR },
  { labelKey: "portal.nav.section.platform", entries: GROUP_PLATFORM },
];

/** Must match the shell breakpoint in AppShell.css / Sidebar.css. */
const MOBILE_QUERY = "(max-width: 48rem)";

export function Sidebar() {
  const { activeView, setActiveView } = useView();
  const { theme } = useTheme();
  const { openSettings, mobileNavOpen, closeMobileNav } = useUI();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useMediaQuery(MOBILE_QUERY, false, {
    getInitialValueInEffect: false,
  });

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
    return entries.map((entry) => (
      <NavItem
        key={entry.id}
        id={entry.id}
        label={t(`portal.nav.${entry.id}`)}
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
    ));
  }

  return (
    <aside
      className={
        mobileNavOpen ? "portal-sidebar portal-sidebar--open" : "portal-sidebar"
      }
      aria-label={t("portal.shell.sidebar.primaryNav")}
      // Off-canvas on mobile: remove from the tab order and accessibility tree.
      inert={isMobile && !mobileNavOpen}
    >
      <div className="portal-sidebar__logo">
        <img
          className="portal-sidebar__mark"
          src={mark}
          alt=""
          aria-hidden="true"
        />
        {/* Both wordmarks render; CSS shows the right one per the actual color
            scheme (data-mantine-color-scheme), so it tracks the rendered theme
            rather than the portal's separate theme state. */}
        <img
          className="portal-sidebar__wordmark portal-sidebar__wordmark--light"
          src={wordmarkLight}
          alt="Stirling"
        />
        <img
          className="portal-sidebar__wordmark portal-sidebar__wordmark--dark"
          src={wordmarkDark}
          alt="Stirling"
        />

        <AppSwitch
          className="portal-sidebar__app-switch"
          current="processor"
          theme={theme}
          onSwitch={goToEditor}
        />

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
          <section key={section.labelKey} className="portal-sidebar__section">
            <h2 className="portal-sidebar__section-label">
              {t(section.labelKey)}
            </h2>
            <div className="portal-sidebar__group">
              {renderGroup(section.entries)}
            </div>
          </section>
        ))}
      </nav>

      <div className="portal-sidebar__footer">
        <LinkAccountFooterItem />
        <NavItem
          id="settings"
          label={t("portal.nav.settings")}
          icon={<SettingsIcon />}
          onClick={() => openSettings()}
        />
      </div>
    </aside>
  );
}
