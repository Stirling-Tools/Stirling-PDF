import { Button, Dropdown, NavItem } from "@shared/components";
import { useView, type ViewId } from "@portal/contexts/ViewContext";
import { useTier } from "@portal/contexts/TierContext";
import { useTheme } from "@portal/contexts/ThemeContext";
import { useUI } from "@portal/contexts/UIContext";
import { useAsync } from "@portal/hooks/useAsync";
import { fetchHomeKpis, type KpiEntry } from "@portal/api/home";
import markLight from "@shared/assets/stirling-mark-light.svg";
import markDark from "@shared/assets/stirling-mark-dark.svg";
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
  DocsIcon,
  SettingsIcon,
  ChevronDownIcon,
} from "@portal/components/icons";
import "@portal/components/Sidebar.css";

// The editor is a separate Vite app with no shared shell, so switching apps is
// a hard navigation — the editor's dev server in dev, the site root in prod.
// A standalone portal deploy can gate this behind a configured editor URL.
const EDITOR_URL = import.meta.env.DEV ? "http://localhost:5180/" : "/";

interface NavEntry {
  id: ViewId;
  label: string;
  icon: React.ReactNode;
}

const GROUP_PRIMARY: NavEntry[] = [
  { id: "home", label: "Home", icon: <HomeIcon /> },
];

const GROUP_OPERATIONAL: NavEntry[] = [
  { id: "users", label: "Users", icon: <UsersIcon /> },
  { id: "sources", label: "Sources", icon: <SourcesIcon /> },
  { id: "policies", label: "Policies", icon: <PoliciesIcon /> },
  { id: "pipelines", label: "Pipelines", icon: <PipelinesIcon /> },
  { id: "documents", label: "Documents", icon: <DocumentsIcon /> },
  { id: "components", label: "Components", icon: <ComponentsIcon /> },
];

const GROUP_PLATFORM: NavEntry[] = [
  {
    id: "infrastructure",
    label: "Infrastructure",
    icon: <InfrastructureIcon />,
  },
  { id: "usage", label: "Usage & Billing", icon: <UsageIcon /> },
  { id: "docs", label: "Developer Docs", icon: <DocsIcon /> },
];

function UsageFooter() {
  const { tier } = useTier();
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
          <span className="portal-sidebar__usage-label">Docs processed</span>
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

  const planLabel = tier === "pro" ? "Pay-as-you-go" : "Enterprise Plan";

  return (
    <div className="portal-sidebar__usage">
      <div className="portal-sidebar__usage-line">
        <span className="portal-sidebar__plan">
          <span className="portal-sidebar__plan-dot" aria-hidden />
          {planLabel}
        </span>
        <span className="portal-sidebar__usage-value">
          {docs != null ? `${docs} docs` : "—"}
        </span>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { activeView, setActiveView } = useView();
  const { theme } = useTheme();
  const { openSettings } = useUI();

  function renderGroup(entries: NavEntry[]) {
    return entries.map((entry) => (
      <NavItem
        key={entry.id}
        id={entry.id}
        label={entry.label}
        icon={entry.icon}
        isActive={activeView === entry.id}
        onClick={(id) => setActiveView(id as ViewId)}
      />
    ));
  }

  return (
    <aside className="portal-sidebar" aria-label="Primary navigation">
      <div className="portal-sidebar__logo">
        <span className="portal-sidebar__brand">
          <img
            className="portal-sidebar__brand-mark"
            src={theme === "dark" ? markDark : markLight}
            alt="Stirling"
          />
          <span className="portal-sidebar__logo-suffix">
            Stirling Processor
          </span>
        </span>

        <Dropdown.Root align="end" className="portal-sidebar__app-switch">
          <Dropdown.Trigger>
            <Button
              variant="ghost"
              className="portal-sidebar__app-switch-btn"
              aria-label="Switch app"
            >
              <ChevronDownIcon size={14} />
            </Button>
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
              Processor
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
              Editor
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
          {renderGroup(GROUP_PLATFORM)}
        </div>
      </nav>

      <div className="portal-sidebar__footer">
        <NavItem
          id="settings"
          label="Settings"
          icon={<SettingsIcon />}
          onClick={() => openSettings()}
        />
        <UsageFooter />
      </div>
    </aside>
  );
}
