import { NavItem } from "@shared/components";
import { useView, type ViewId } from "@app/contexts/ViewContext";
import { useTier } from "@app/contexts/TierContext";
import {
  HomeIcon,
  EditorIcon,
  SourcesIcon,
  PipelinesIcon,
  DocumentsIcon,
  InfrastructureIcon,
  UsageIcon,
  DocsIcon,
  SettingsIcon,
  ChevronDownIcon,
} from "@app/components/icons";
import "@app/components/Sidebar.css";

interface NavEntry {
  id: ViewId;
  label: string;
  icon: React.ReactNode;
}

const GROUP_PRIMARY: NavEntry[] = [
  { id: "home", label: "Home", icon: <HomeIcon /> },
];

const GROUP_OPERATIONAL: NavEntry[] = [
  { id: "editor", label: "Editor", icon: <EditorIcon /> },
  { id: "sources", label: "Sources", icon: <SourcesIcon /> },
  { id: "pipelines", label: "Pipelines", icon: <PipelinesIcon /> },
  { id: "documents", label: "Documents", icon: <DocumentsIcon /> },
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

function StirlingMark() {
  // The Stirling brand mark — two stacked parallelograms in the brand blues.
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      aria-hidden
      role="presentation"
    >
      <path d="M5 4 L20 4 L17 11 L2 11 Z" fill="var(--color-blue)" />
      <path d="M5 11 L17 11 L14 18 L2 18 Z" fill="var(--color-blue-border)" />
    </svg>
  );
}

function UsageFooter() {
  const { tier } = useTier();

  if (tier === "free") {
    const docs = 247;
    const cap = 500;
    const pct = (docs / cap) * 100;
    return (
      <div className="portal-sidebar__usage portal-sidebar__usage--free">
        <div className="portal-sidebar__usage-line">
          <span className="portal-sidebar__usage-label">Docs processed</span>
          <span className="portal-sidebar__usage-value">
            {docs} / {cap}
          </span>
        </div>
        <div
          className="portal-sidebar__usage-track"
          role="progressbar"
          aria-valuenow={docs}
          aria-valuemax={cap}
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
  const docCount = tier === "pro" ? "12,481" : "1.84M";

  return (
    <div className="portal-sidebar__usage">
      <div className="portal-sidebar__usage-line">
        <span className="portal-sidebar__plan">
          <span className="portal-sidebar__plan-dot" aria-hidden />
          {planLabel}
        </span>
        <span className="portal-sidebar__usage-value">{docCount} docs</span>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { activeView, setActiveView } = useView();

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
        <StirlingMark />
        <span className="portal-sidebar__wordmark">Stirling</span>
        <button
          type="button"
          className="portal-sidebar__workspace"
          aria-label="Switch workspace"
        >
          <ChevronDownIcon size={14} />
        </button>
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
          isActive={activeView === "settings"}
          onClick={(id) => setActiveView(id as ViewId)}
        />
        <UsageFooter />
      </div>
    </aside>
  );
}
