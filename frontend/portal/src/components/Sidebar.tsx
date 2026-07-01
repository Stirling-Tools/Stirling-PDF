import { useTranslation } from "react-i18next";
import { Dropdown, NavItem } from "@shared/components";
import { useView, type ViewId } from "@portal/contexts/ViewContext";
import { useTier } from "@portal/contexts/TierContext";
import { useTheme } from "@portal/contexts/ThemeContext";
import { useUI } from "@portal/contexts/UIContext";
import { useLink } from "@portal/contexts/LinkContext";
import { useAsync } from "@portal/hooks/useAsync";
import { fetchHomeKpis, type KpiEntry } from "@portal/api/home";
import { EDITOR_URL } from "@portal/auth/editorUrl";
import markLight from "@shared/assets/brand/modern-logo/StirlingPDFLogoNoTextLight.svg";
import markDark from "@shared/assets/brand/modern-logo/StirlingPDFLogoNoTextDark.svg";
import {
  HomeIcon,
  UsersIcon,
  SourcesIcon,
  PoliciesIcon,
  PipelinesIcon,
  DocumentsIcon,
  ComponentsIcon,
  InfrastructureIcon,
  UsageIcon,
  LinkIcon,
  DocsIcon,
  ProcurementIcon,
  SettingsIcon,
  ChevronDownIcon,
} from "@portal/components/icons";
import "@portal/components/Sidebar.css";

interface NavEntry {
  id: ViewId;
  icon: React.ReactNode;
}

const GROUP_PRIMARY: NavEntry[] = [{ id: "home", icon: <HomeIcon /> }];

const GROUP_OPERATIONAL: NavEntry[] = [
  { id: "users", icon: <UsersIcon /> },
  { id: "sources", icon: <SourcesIcon /> },
  { id: "policies", icon: <PoliciesIcon /> },
  { id: "pipelines", icon: <PipelinesIcon /> },
  { id: "documents", icon: <DocumentsIcon /> },
  { id: "components", icon: <ComponentsIcon /> },
];

const GROUP_PLATFORM: NavEntry[] = [
  { id: "infrastructure", icon: <InfrastructureIcon /> },
  { id: "usage", icon: <UsageIcon /> },
  { id: "docs", icon: <DocsIcon /> },
];

/**
 * Sidebar-footer link-account CTA. Only visible when the org is unlinked — once
 * linked, the linked-instances row + plan badge already communicate the state,
 * so a permanent footer button would be noise. Click → opens the login modal
 * directly.
 */
function LinkAccountFooterItem() {
  const { t } = useTranslation();
  const { openLinkModal } = useUI();
  const { linkState } = useLink();
  if (linkState !== "unlinked") return null;
  return (
    <NavItem
      id="account-link"
      label={t("shell.sidebar.linkAccount", "Link Stirling account")}
      icon={<LinkIcon />}
      onClick={() => openLinkModal()}
    />
  );
}

function UsageFooter() {
  const { tier } = useTier();
  const { t } = useTranslation();
  // Read the same endpoint Home's KPI strip uses so the doc count here can't
  // drift from the headline figure. The first KPI is always the doc total.
  const { data: kpis, loading } = useAsync<KpiEntry[]>(
    () => fetchHomeKpis(tier),
    [tier],
  );
  const docs = loading ? undefined : kpis?.[0]?.value;

  if (tier === "free") {
    // The free doc KPI is formatted "used / cap"; parse it for the meter.
    const [used, cap] =
      typeof docs === "string"
        ? docs.split("/").map((s) => Number(s.replace(/[^\d]/g, "")))
        : [];
    const pct = used && cap ? (used / cap) * 100 : 0;
    return (
      <div className="portal-sidebar__usage portal-sidebar__usage--free">
        <div className="portal-sidebar__usage-line">
          <span className="portal-sidebar__usage-label">
            {t("shell.sidebar.docsProcessed")}
          </span>
          <span className="portal-sidebar__usage-value">{docs ?? "—"}</span>
        </div>
        <div
          className="portal-sidebar__usage-track"
          role="progressbar"
          aria-valuenow={used ?? 0}
          aria-valuemax={cap ?? 100}
        >
          <div
            className="portal-sidebar__usage-fill"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  const planLabel =
    tier === "pro"
      ? t("shell.sidebar.planProcessor", "Processor plan")
      : t("shell.sidebar.planEnterprise", "Enterprise plan");

  return (
    <div className="portal-sidebar__usage">
      <div className="portal-sidebar__usage-line">
        <span className="portal-sidebar__plan">
          <span className="portal-sidebar__plan-dot" aria-hidden />
          {planLabel}
        </span>
        <span className="portal-sidebar__usage-value">
          {docs != null ? t("shell.sidebar.docsCount", { docs }) : "—"}
        </span>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { activeView, setActiveView } = useView();
  const { theme } = useTheme();
  const { openSettings } = useUI();
  const { tier } = useTier();
  const { t } = useTranslation();

  // Procurement is the enterprise buyer's commercial journey — surfaced only to
  // enterprise tenants (it has no free/pro equivalent).
  const platformGroup: NavEntry[] =
    tier === "enterprise"
      ? [{ id: "procurement", icon: <ProcurementIcon /> }, ...GROUP_PLATFORM]
      : GROUP_PLATFORM;

  function renderGroup(entries: NavEntry[]) {
    return entries.map((entry) => (
      <NavItem
        key={entry.id}
        id={entry.id}
        label={t(`nav.${entry.id}`)}
        icon={entry.icon}
        isActive={activeView === entry.id}
        onClick={(id) => setActiveView(id as ViewId)}
      />
    ));
  }

  return (
    <aside
      className="portal-sidebar"
      aria-label={t("shell.sidebar.primaryNav")}
    >
      <div className="portal-sidebar__logo">
        <span className="portal-sidebar__brand">
          <img
            className="portal-sidebar__brand-mark"
            src={theme === "dark" ? markDark : markLight}
            alt="Stirling"
          />
          <span className="portal-sidebar__logo-suffix">
            {t("shell.sidebar.brandSuffix")}
          </span>
        </span>

        <Dropdown.Root align="end" className="portal-sidebar__app-switch">
          <Dropdown.Trigger>
            <button
              type="button"
              className="portal-sidebar__app-switch-btn"
              aria-label={t("shell.sidebar.switchApp")}
            >
              <ChevronDownIcon size={14} />
            </button>
          </Dropdown.Trigger>
          <Dropdown.Menu width="11rem">
            <Dropdown.Item
              active
              leading={
                <img
                  className="portal-sidebar__app-icon"
                  src={theme === "dark" ? markDark : markLight}
                  alt=""
                />
              }
            >
              {t("shell.sidebar.appProcessor")}
            </Dropdown.Item>
            <Dropdown.Item
              onSelect={() => {
                window.location.href = EDITOR_URL;
              }}
              leading={
                <img
                  className="portal-sidebar__app-icon"
                  src={theme === "dark" ? markDark : markLight}
                  alt=""
                />
              }
            >
              {t("shell.sidebar.appEditor")}
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Root>
      </div>

      <nav className="portal-sidebar__nav">
        <div className="portal-sidebar__group">
          {renderGroup(GROUP_PRIMARY)}
        </div>
        <div className="portal-sidebar__divider" aria-hidden />
        <div className="portal-sidebar__group">
          {renderGroup(GROUP_OPERATIONAL)}
        </div>
        <div className="portal-sidebar__divider" aria-hidden />
        <div className="portal-sidebar__group">
          {renderGroup(platformGroup)}
        </div>
      </nav>

      <div className="portal-sidebar__footer">
        <LinkAccountFooterItem />
        <NavItem
          id="settings"
          label={t("nav.settings")}
          icon={<SettingsIcon />}
          onClick={() => openSettings()}
        />
        <UsageFooter />
      </div>
    </aside>
  );
}
