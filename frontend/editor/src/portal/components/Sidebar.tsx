import { NavItem } from "@app/ui";
import { AppSwitch } from "@app/components/shared/AppSwitch";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useView, type ViewId } from "@portal/contexts/ViewContext";
import { useTier } from "@portal/contexts/TierContext";
import { useTheme } from "@portal/contexts/ThemeContext";
import { useUI } from "@portal/contexts/UIContext";
import { LinkAccountFooterItem } from "@portal/components/LinkAccountFooterItem";
import { useAsync } from "@portal/hooks/useAsync";
import { fetchHomeKpis, type KpiEntry } from "@portal/api/home";
import { EDITOR_URL, EDITOR_IS_SAME_APP } from "@portal/auth/editorUrl";
import markLight from "@app/assets/brand/modern-logo/StirlingPDFLogoNoTextLight.svg";
import markDark from "@app/assets/brand/modern-logo/StirlingPDFLogoNoTextDark.svg";
import { SettingsIcon } from "@portal/components/icons";
import {
  GROUP_PRIMARY,
  GROUP_OPERATIONAL,
  GROUP_PLATFORM,
  type NavEntry,
} from "@portal/components/sidebarGroups";
import "@portal/components/Sidebar.css";

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
            {t("portal.shell.sidebar.docsProcessed")}
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
      ? t("portal.shell.sidebar.planProcessor", "Processor plan")
      : t("portal.shell.sidebar.planEnterprise", "Enterprise plan");

  return (
    <div className="portal-sidebar__usage">
      <div className="portal-sidebar__usage-line">
        <span className="portal-sidebar__plan">
          <span className="portal-sidebar__plan-dot" aria-hidden />
          {planLabel}
        </span>
        <span className="portal-sidebar__usage-value">
          {docs != null ? t("portal.shell.sidebar.docsCount", { docs }) : "—"}
        </span>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { activeView, setActiveView } = useView();
  const { theme } = useTheme();
  const { openSettings } = useUI();
  const { t } = useTranslation();
  const navigate = useNavigate();

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
      className="portal-sidebar"
      aria-label={t("portal.shell.sidebar.primaryNav")}
    >
      <div className="portal-sidebar__logo">
        <span className="portal-sidebar__brand">
          <img
            className="portal-sidebar__brand-mark"
            src={theme === "dark" ? markDark : markLight}
            alt="Stirling"
          />
          <span className="portal-sidebar__logo-suffix">
            {t("portal.shell.sidebar.brandSuffix")}
          </span>
        </span>

        <AppSwitch
          className="portal-sidebar__app-switch"
          current="processor"
          theme={theme}
          onSwitch={goToEditor}
        />
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
          {renderGroup(GROUP_PLATFORM)}
        </div>
      </nav>

      <div className="portal-sidebar__footer">
        <LinkAccountFooterItem />
        <NavItem
          id="settings"
          label={t("portal.nav.settings")}
          icon={<SettingsIcon />}
          onClick={() => openSettings()}
        />
        <UsageFooter />
      </div>
    </aside>
  );
}
